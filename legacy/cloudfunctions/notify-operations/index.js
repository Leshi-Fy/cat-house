/**
 * 消息通知云函数
 * actions:
 *   create    — 创建一条通知（由其他云函数内部调用）
 *   list      — 获取当前用户的通知列表（分 tab）
 *   unreadCount — 获取未读总数（角标用）
 *   markRead  — 将某些通知标为已读
 *   markAllRead — 全部标为已读
 *
 * notifications 集合字段：
 *   _id, recipientId, senderId, senderName, senderAvatar,
 *   type: 'like' | 'comment' | 'donate',
 *   feedId(like/comment), crowdId(donate),
 *   feedContent(动态内容摘要), commentContent,
 *   amount(捐款金额，分),
 *   isRead: Boolean,
 *   createTime
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
      return await createNotification(event);
    case 'list':
      return await listNotifications(event, OPENID);
    case 'unreadCount':
      return await getUnreadCount(OPENID);
    case 'markRead':
      return await markRead(event, OPENID);
    case 'markAllRead':
      return await markAllRead(event, OPENID);
    default:
      return { error: '未知操作' };
  }
};

/**
 * 创建通知（由其他云函数调用，需在云端互调）
 */
async function createNotification(event) {
  const {
    recipientId, senderId, senderName, senderAvatar,
    type, feedId, feedContent, crowdId, commentContent, amount,
  } = event;

  // 不给自己发通知
  if (!recipientId || recipientId === senderId) {
    return { success: true, skipped: true };
  }

  try {
    await db.collection('notifications').add({
      data: {
        recipientId,
        senderId,
        senderName: senderName || '匿名用户',
        senderAvatar: senderAvatar || '',
        type,                        // 'like' | 'comment' | 'donate'
        feedId: feedId || null,
        feedContent: feedContent || '',
        crowdId: crowdId || null,
        commentContent: commentContent || '',
        amount: amount || 0,
        isRead: false,
        createTime: db.serverDate(),
      },
    });
    return { success: true };
  } catch (err) {
    console.error('创建通知失败:', err);
    return { error: err.message };
  }
}

/**
 * 获取通知列表
 * @param {string} event.type - 'like' | 'comment' | 'donate' | '' 全部
 */
async function listNotifications(event, openid) {
  const { type, page = 0, pageSize = 20 } = event;
  try {
    let query = db.collection('notifications').where({ recipientId: openid });
    if (type) {
      query = query.where({ type });
    }
    const { data } = await query
      .orderBy('createTime', 'desc')
      .skip(page * pageSize)
      .limit(pageSize)
      .get();

    return { success: true, data };
  } catch (err) {
    console.error('获取通知列表失败:', err);
    return { error: err.message };
  }
}

/**
 * 获取未读数量（各 tab 分开 + 总数）
 */
async function getUnreadCount(openid) {
  try {
    const [likeRes, commentRes, donateRes] = await Promise.all([
      db.collection('notifications').where({ recipientId: openid, type: 'like',    isRead: false }).count(),
      db.collection('notifications').where({ recipientId: openid, type: 'comment', isRead: false }).count(),
      db.collection('notifications').where({ recipientId: openid, type: 'donate',  isRead: false }).count(),
    ]);

    const likeCount    = likeRes.total    || 0;
    const commentCount = commentRes.total || 0;
    const donateCount  = donateRes.total  || 0;
    const total        = likeCount + commentCount + donateCount;

    return { success: true, total, likeCount, commentCount, donateCount };
  } catch (err) {
    console.error('获取未读数量失败:', err);
    return { success: true, total: 0, likeCount: 0, commentCount: 0, donateCount: 0 };
  }
}

/**
 * 标记指定通知为已读
 */
async function markRead(event, openid) {
  const { ids } = event;  // string[]
  if (!ids || ids.length === 0) return { success: true };

  try {
    for (const id of ids) {
      await db.collection('notifications').doc(id).update({
        data: { isRead: true },
      });
    }
    return { success: true };
  } catch (err) {
    console.error('标记已读失败:', err);
    return { error: err.message };
  }
}

/**
 * 全部标为已读（按 type 或全部）
 */
async function markAllRead(event, openid) {
  const { type } = event;
  try {
    const where = { recipientId: openid, isRead: false };
    if (type) where.type = type;

    await db.collection('notifications').where(where).update({
      data: { isRead: true },
    });
    return { success: true };
  } catch (err) {
    console.error('全部标为已读失败:', err);
    return { error: err.message };
  }
}
