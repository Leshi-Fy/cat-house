/**
 * 动态操作云函数
 * actions: create, update, list, myFeeds, like, unlike, delete, getDetail, addComment, listComments, deleteComment
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  switch (action) {
    case 'create':
      return await createFeed(event, OPENID);
    case 'update':
      return await updateFeed(event, OPENID);
    case 'list':
      return await listFeeds(event, OPENID);
    case 'myFeeds':
      return await getMyFeeds(event, OPENID);
    case 'like':
      return await likeFeed(event, OPENID);
    case 'unlike':
      return await unlikeFeed(event, OPENID);
    case 'delete':
      return await deleteFeed(event, OPENID);
    case 'getDetail':
      return await getFeedDetail(event, OPENID);
    case 'addComment':
      return await addComment(event, OPENID);
    case 'listComments':
      return await listComments(event, OPENID);
    case 'deleteComment':
      return await deleteComment(event, OPENID);
    default:
      return { error: '未知操作' };
  }
};

/**
 * 创建动态
 */
async function createFeed(event, openid) {
  const { content, photos, catId, catName } = event;

  // 获取用户信息
  let userInfo = { nickName: '匿名用户', avatarUrl: '' };
  try {
    const userRes = await db.collection('users').doc(openid).get();
    if (userRes.data) {
      userInfo = {
        nickName: userRes.data.nickName || '匿名用户',
        avatarUrl: userRes.data.avatarUrl || ''
      };
    }
  } catch (e) {
    console.log('获取用户信息失败');
  }

  // 如果有 catId，获取猫咪信息
  let catInfo = null;
  if (catId) {
    try {
      const catRes = await db.collection('stray_cats').doc(catId).get();
      if (catRes.data) {
        catInfo = {
          _id: catId,
          name: catRes.data.name,
          breed: catRes.data.breed,
          photos: catRes.data.photos
        };
      }
    } catch (e) {
      console.log('获取猫咪信息失败');
    }
  }

  const feed = {
    content: content,
    photos: photos || [],
    authorId: openid,
    authorName: userInfo.nickName,
    authorAvatar: userInfo.avatarUrl,
    catId: catId || null,
    catInfo: catInfo,
    likeCount: 0,
    commentCount: 0,
    createTime: db.serverDate(),
    updateTime: db.serverDate(),
  };

  const { _id } = await db.collection('feeds').add({ data: feed });
  return { success: true, feedId: _id };
}

/**
 * 获取动态列表
 */
async function listFeeds(event, openid) {
  const { page = 0, pageSize = 10 } = event;

  try {
    // 获取动态列表（按时间倒序）
    const { data } = await db.collection('feeds')
      .orderBy('createTime', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get();

    // 获取当前用户的点赞状态
    const feedIds = data.map(f => f._id);
    let likedFeeds = [];
    
    if (feedIds.length > 0) {
      try {
        const likeRes = await db.collection('feed_likes')
          .where({
            feedId: _.in(feedIds),
            userId: openid
          })
          .get();
        likedFeeds = likeRes.data.map(l => l.feedId);
      } catch (e) {
        console.log('获取点赞状态失败');
      }
    }

    // 标记点赞状态，并映射用户信息字段
    const feeds = data.map(feed => ({
      ...feed,
      isLiked: likedFeeds.includes(feed._id),
      userName: feed.authorName,
      userAvatar: feed.authorAvatar
    }));

    return { success: true, data: feeds };
  } catch (err) {
    console.error('获取动态列表失败:', err);
    return { error: err.message };
  }
}

/**
 * 获取我的动态（修复版：补全 catInfo + likeCount）
 */
async function getMyFeeds(event, openid) {
  const { page = 0, pageSize = 10 } = event;

  try {
    const { data } = await db.collection('feeds')
      .where({ authorId: openid })
      .orderBy('createTime', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get();

    if (!data || data.length === 0) {
      return { success: true, data: [] };
    }

    // 批量查询点赞数（一次查完，比逐条 Promise.all 快很多）
    const feedIds = data.map(f => f._id);
    const likeDocs = await db.collection('feed_likes')
      .where({ feedId: _.in(feedIds) })
      .field({ feedId: true })
      .limit(100)
      .get();
    const likeCountMap = {};
    (likeDocs.data || []).forEach(doc => {
      likeCountMap[doc.feedId] = (likeCountMap[doc.feedId] || 0) + 1;
    });

    // 批量补查缺失的 catInfo
    const needCatIds = data
      .filter(f => f.catId && !f.catInfo)
      .map(f => f.catId);
    const uniqueCatIds = [...new Set(needCatIds)];

    let catMap = {};
    if (uniqueCatIds.length > 0) {
      try {
        const catDocs = await db.collection('stray_cats')
          .where({ _id: _.in(uniqueCatIds) })
          .field({ _id: true, name: true, breed: true, photos: true })
          .limit(20)
          .get();
        (catDocs.data || []).forEach(c => {
          catMap[c._id] = { _id: c._id, name: c.name, breed: c.breed, photos: c.photos || [] };
        });
        // 补查家养猫（stray_cats 中找不到的）
        const notFound = uniqueCatIds.filter(id => !catMap[id]);
        if (notFound.length > 0) {
          const homeDocs = await db.collection('home_cats')
            .where({ _id: _.in(notFound) })
            .field({ _id: true, name: true, breed: true, photos: true })
            .limit(20)
            .get();
          (homeDocs.data || []).forEach(c => {
            catMap[c._id] = { _id: c._id, name: c.name, breed: c.breed, photos: c.photos || [] };
          });
        }
      } catch (e) { /* ignore */ }
    }

    // 组装结果
    const feedsWithDetail = data.map(feed => ({
      ...feed,
      catInfo: feed.catInfo || catMap[feed.catId] || null,
      likeCount: likeCountMap[feed._id] || 0,
    }));

    return { success: true, data: feedsWithDetail };
  } catch (err) {
    console.error('获取我的动态失败:', err);
    return { error: err.message };
  }
}

/**
 * 编辑动态
 */
async function updateFeed(event, openid) {
  const { feedId, content, photos, catId, catName } = event;

  try {
    // 验证是作者本人
    const { data: feed } = await db.collection('feeds').doc(feedId).get();
    if (feed.authorId !== openid) {
      return { error: '无权编辑' };
    }

    // 重新查询关联猫咪信息
    let catInfo = null;
    if (catId) {
      try {
        const catRes = await db.collection('stray_cats').doc(catId).get();
        if (catRes.data) {
          catInfo = {
            _id: catId,
            name: catRes.data.name,
            breed: catRes.data.breed,
            photos: catRes.data.photos || []
          };
        }
      } catch (e) {
        try {
          const homeCatRes = await db.collection('home_cats').doc(catId).get();
          if (homeCatRes.data) {
            catInfo = {
              _id: catId,
              name: homeCatRes.data.name,
              breed: homeCatRes.data.breed,
              photos: homeCatRes.data.photos || []
            };
          }
        } catch (e2) { /* ignore */ }
      }
    }

    await db.collection('feeds').doc(feedId).update({
      data: {
        content,
        photos: photos || [],
        catId: catId || null,
        catInfo: catInfo,
        updateTime: db.serverDate(),
      }
    });

    return { success: true };
  } catch (err) {
    console.error('编辑动态失败:', err);
    return { error: err.message };
  }
}

/**
 * 点赞
 */
async function likeFeed(event, openid) {
  const { feedId } = event;

  try {
    // 检查是否已点赞
    const likeRes = await db.collection('feed_likes')
      .where({ feedId, userId: openid })
      .get();

    if (likeRes.data.length > 0) {
      return { success: true, message: '已点赞' };
    }

    // 添加点赞记录
    await db.collection('feed_likes').add({
      data: {
        feedId,
        userId: openid,
        createTime: db.serverDate()
      }
    });

    // 更新点赞数
    await db.collection('feeds').doc(feedId).update({
      data: {
        likeCount: _.inc(1)
      }
    });

    // 给动态作者发通知（云函数内部调用）
    try {
      const { data: feed } = await db.collection('feeds').doc(feedId).get();
      if (feed && feed.authorId && feed.authorId !== openid) {
        let senderInfo = { nickName: '匿名用户', avatarUrl: '' };
        try {
          const userRes = await db.collection('users').doc(openid).get();
          if (userRes.data) senderInfo = userRes.data;
        } catch (e) {}
        await cloud.callFunction({
          name: 'notify-operations',
          data: {
            action: 'create',
            recipientId: feed.authorId,
            senderId: openid,
            senderName: senderInfo.nickName || '匿名用户',
            senderAvatar: senderInfo.avatarUrl || '',
            type: 'like',
            feedId,
            feedContent: feed.content ? feed.content.slice(0, 50) : '',
          },
        });
      }
    } catch (e) {
      console.log('发送点赞通知失败（不影响主流程）:', e.message);
    }

    return { success: true };
  } catch (err) {
    console.error('点赞失败:', err);
    return { error: err.message };
  }
}

/**
 * 取消点赞
 */
async function unlikeFeed(event, openid) {
  const { feedId } = event;

  try {
    // 删除点赞记录
    const likeRes = await db.collection('feed_likes')
      .where({ feedId, userId: openid })
      .get();

    if (likeRes.data.length > 0) {
      await db.collection('feed_likes').doc(likeRes.data[0]._id).remove();
    }

    // 更新点赞数
    await db.collection('feeds').doc(feedId).update({
      data: {
        likeCount: _.inc(-1)
      }
    });

    return { success: true };
  } catch (err) {
    console.error('取消点赞失败:', err);
    return { error: err.message };
  }
}

/**
 * 删除动态
 */
async function deleteFeed(event, openid) {
  const { feedId } = event;

  try {
    // 验证是作者本人
    const feed = await db.collection('feeds').doc(feedId).get();
    if (feed.data.authorId !== openid) {
      return { error: '无权删除' };
    }

    await db.collection('feeds').doc(feedId).remove();
    return { success: true };
  } catch (err) {
    console.error('删除失败:', err);
    return { error: err.message };
  }
}

/**
 * 获取动态详情
 */
async function getFeedDetail(event, openid) {
  const { feedId } = event;

  try {
    const { data: feed } = await db.collection('feeds').doc(feedId).get();

    // 检查当前用户是否已点赞
    let isLiked = false;
    try {
      const likeRes = await db.collection('feed_likes')
        .where({ feedId, userId: openid })
        .get();
      isLiked = likeRes.data.length > 0;
    } catch (e) {
      console.log('查询点赞状态失败');
    }

    return {
      success: true,
      data: {
        ...feed,
        isLiked,
        userName: feed.authorName,
        userAvatar: feed.authorAvatar
      }
    };
  } catch (err) {
    console.error('获取动态详情失败:', err);
    return { error: err.message };
  }
}

/**
 * 发表评论
 */
async function addComment(event, openid) {
  const { feedId, content, parentId } = event;

  if (!content || !content.trim()) {
    return { error: '评论内容不能为空' };
  }

  try {
    // 获取用户信息
    let userInfo = { nickName: '匿名用户', avatarUrl: '' };
    try {
      const userRes = await db.collection('users').doc(openid).get();
      if (userRes.data) {
        userInfo = {
          nickName: userRes.data.nickName || '匿名用户',
          avatarUrl: userRes.data.avatarUrl || ''
        };
      }
    } catch (e) {
      console.log('获取用户信息失败');
    }

    const comment = {
      feedId,
      content: content.trim(),
      authorId: openid,
      authorName: userInfo.nickName,
      authorAvatar: userInfo.avatarUrl,
      parentId: parentId || null,   // null = 一级评论，否则是回复某条评论
      likeCount: 0,
      createTime: db.serverDate(),
    };

    const { _id } = await db.collection('feed_comments').add({ data: comment });

    // 更新动态的评论计数
    await db.collection('feeds').doc(feedId).update({
      data: { commentCount: _.inc(1) }
    });

    // 给动态作者发通知
    try {
      const { data: feed } = await db.collection('feeds').doc(feedId).get();
      if (feed && feed.authorId && feed.authorId !== openid) {
        await cloud.callFunction({
          name: 'notify-operations',
          data: {
            action: 'create',
            recipientId: feed.authorId,
            senderId: openid,
            senderName: userInfo.nickName || '匿名用户',
            senderAvatar: userInfo.avatarUrl || '',
            type: 'comment',
            feedId,
            feedContent: feed.content ? feed.content.slice(0, 50) : '',
            commentContent: content.trim().slice(0, 100),
          },
        });
      }
    } catch (e) {
      console.log('发送评论通知失败（不影响主流程）:', e.message);
    }

    return {
      success: true,
      data: {
        _id,
        ...comment,
      }
    };
  } catch (err) {
    console.error('发表评论失败:', err);
    return { error: err.message };
  }
}

/**
 * 获取评论列表（一级评论 + 最近2条回复）
 */
async function listComments(event, openid) {
  const { feedId, page = 0, pageSize = 20 } = event;

  try {
    // 获取一级评论（按时间倒序）
    const { data: comments } = await db.collection('feed_comments')
      .where({ feedId, parentId: null })
      .orderBy('createTime', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get();

    // 为每条一级评论获取最近的回复
    const commentsWithReplies = await Promise.all(
      comments.map(async (comment) => {
        // 获取该评论的回复（最多2条）
        let replies = [];
        try {
          const replyRes = await db.collection('feed_comments')
            .where({ parentId: comment._id })
            .orderBy('createTime', 'asc')
            .limit(2)
            .get();
          replies = replyRes.data;
        } catch (e) {
          console.log('获取回复失败');
        }

        // 获取回复总数
        let replyCount = replies.length;
        try {
          const countRes = await db.collection('feed_comments')
            .where({ parentId: comment._id })
            .count();
          replyCount = countRes.total;
        } catch (e) {
          // 使用已有回复数
        }

        return {
          ...comment,
          replyCount,
          replies,
          isAuthor: comment.authorId === openid,
        };
      })
    );

    return { success: true, data: commentsWithReplies };
  } catch (err) {
    console.error('获取评论列表失败:', err);
    return { error: err.message };
  }
}

/**
 * 删除评论
 */
async function deleteComment(event, openid) {
  const { commentId } = event;

  try {
    const comment = await db.collection('feed_comments').doc(commentId).get();

    // 只有评论作者可以删除
    if (comment.data.authorId !== openid) {
      return { error: '无权删除' };
    }

    // 删除评论
    await db.collection('feed_comments').doc(commentId).remove();

    // 如果是一级评论，同时删除所有回复
    if (!comment.data.parentId) {
      const { data: replies } = await db.collection('feed_comments')
        .where({ parentId: commentId })
        .get();

      for (const reply of replies) {
        await db.collection('feed_comments').doc(reply._id).remove();
      }

      // 更新动态评论计数（减去评论+回复数）
      await db.collection('feeds').doc(comment.data.feedId).update({
        data: { commentCount: _.inc(-(1 + replies.length)) }
      });
    } else {
      // 回复只减1
      await db.collection('feeds').doc(comment.data.feedId).update({
        data: { commentCount: _.inc(-1) }
      });
    }

    return { success: true };
  } catch (err) {
    console.error('删除评论失败:', err);
    return { error: err.message };
  }
}
