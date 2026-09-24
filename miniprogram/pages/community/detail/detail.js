/**
 * 动态详情页 - 评论互动
 */
const { timeAgo } = require('../../../utils/util');
const app = getApp();

Page({
  data: {
    feedId: '',
    feed: null,
    comments: [],
    commentText: '',
    hasContent: false,
    isLoading: true,
    isSubmitting: false,
    placeholder: '说点什么...',
    replyTo: null,       // 回复某人 { _id, authorName }
    showAllReplies: {},   // { commentId: true } 展开所有回复
  },

  onLoad(options) {
    const { id } = options;
    if (!id) {
      wx.showToast({ title: '参数错误', icon: 'none' });
      setTimeout(() => wx.navigateBack(), 1500);
      return;
    }
    this.setData({ feedId: id });
    this.loadFeedDetail();
    this.loadComments();
  },

  /**
   * 加载动态详情
   */
  async loadFeedDetail() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: { action: 'getDetail', feedId: this.data.feedId },
      });

      if (result.error) throw new Error(result.error);

      this.setData({
        feed: {
          ...result.data,
          formattedTime: timeAgo(result.data.createTime),
        },
        isLoading: false,
      });
    } catch (err) {
      console.error('加载动态详情失败:', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: '加载失败', icon: 'none' });
    }
  },

  /**
   * 加载评论列表
   */
  async loadComments() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: { action: 'listComments', feedId: this.data.feedId },
      });

      if (result.error) throw new Error(result.error);

      const comments = (result.data || []).map(c => ({
        ...c,
        formattedTime: timeAgo(c.createTime),
        replies: (c.replies || []).map(r => ({
          ...r,
          formattedTime: timeAgo(r.createTime),
        })),
      }));

      this.setData({ comments });
    } catch (err) {
      console.error('加载评论失败:', err);
    }
  },

  /**
   * 评论输入
   */
  onCommentInput(e) {
    const val = e.detail.value;
    this.setData({
      commentText: val,
      hasContent: val.trim().length > 0,  // 用 data 字段标记是否有内容
    });
  },

  /**
   * 聚焦输入框
   */
  onCommentFocus() {
    // 确保已登录：后端评论只要求 openid，按 openid 判断（userInfo 缓存缺失不应拦截）
    const openid = (app.globalData && app.globalData.openid) || wx.getStorageSync('openid');
    if (!openid) {
      wx.showModal({
        title: '需要登录',
        content: '评论需要先登录',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/user/profile/profile' });
          }
        }
      });
      return false;
    }
  },

  /**
   * 点击某条评论 → 回复
   */
  onReplyTo(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({
      replyTo: { _id: id, authorName: name },
      placeholder: `回复 ${name}`,
    });
  },

  /**
   * 取消回复
   */
  cancelReply() {
    this.setData({
      replyTo: null,
      placeholder: '说点什么...',
    });
  },

  /**
   * 发送评论/回复
   */
  async submitComment() {
    const { commentText, feedId, replyTo } = this.data;
    if (!commentText.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) return;

    this.setData({ isSubmitting: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: {
          action: 'addComment',
          feedId,
          content: commentText.trim(),
          parentId: replyTo ? replyTo._id : null,
        },
      });

      if (result.error) throw new Error(result.error);

      wx.showToast({ title: '评论成功', icon: 'success' });

      // 清空输入
      this.setData({
        commentText: '',
        hasContent: false,
        replyTo: null,
        placeholder: '说点什么...',
        isSubmitting: false,
      });

      // 刷新评论列表
      this.loadComments();

      // 更新本地 feed 的 commentCount
      const feed = this.data.feed;
      if (feed) {
        this.setData({
          'feed.commentCount': (feed.commentCount || 0) + 1,
        });
      }
    } catch (err) {
      console.error('评论失败:', err);
      this.setData({ isSubmitting: false });
      wx.showToast({ title: err.message || '评论失败', icon: 'none' });
    }
  },

  /**
   * 展开/收起回复
   */
  onToggleReplies(e) {
    const { id } = e.currentTarget.dataset;
    const showAllReplies = { ...this.data.showAllReplies };
    showAllReplies[id] = !showAllReplies[id];
    this.setData({ showAllReplies });
  },

  /**
   * 查看全部回复
   */
  async onViewAllReplies(e) {
    const { id } = e.currentTarget.dataset;

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: { action: 'listReplies', commentId: id },
      });

      if (result.error) throw new Error(result.error);

      const comments = this.data.comments.map(c => {
        if (c._id === id) {
          return {
            ...c,
            replies: (result.data || []).map(r => ({
              ...r,
              formattedTime: timeAgo(r.createTime),
            })),
          };
        }
        return c;
      });

      const showAllReplies = { ...this.data.showAllReplies, [id]: true };
      this.setData({ comments, showAllReplies });
    } catch (err) {
      console.error('加载回复失败:', err);
      // 降级：直接用云数据库查
      this._loadRepliesFallback(id);
    }
  },

  /**
   * 降级方案：直接查云数据库获取回复
   */
  async _loadRepliesFallback(commentId) {
    const db = wx.cloud.database();
    try {
      const { data } = await db.collection('feed_comments')
        .where({ parentId: commentId })
        .orderBy('createTime', 'asc')
        .limit(50)
        .get();

      const comments = this.data.comments.map(c => {
        if (c._id === commentId) {
          return {
            ...c,
            replies: data.map(r => ({
              ...r,
              formattedTime: timeAgo(r.createTime),
            })),
          };
        }
        return c;
      });

      const showAllReplies = { ...this.data.showAllReplies, [commentId]: true };
      this.setData({ comments, showAllReplies });
    } catch (err) {
      console.error('加载回复失败:', err);
    }
  },

  /**
   * 删除评论（长按触发）
   */
  onDeleteComment(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '删除评论',
      content: '确定要删除这条评论吗？',
      confirmColor: '#FF6B6B',
      success: async (res) => {
        if (!res.confirm) return;
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'feed-operations',
            data: { action: 'deleteComment', commentId: id },
          });
          if (result.error) throw new Error(result.error);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadComments();
          // 更新本地 commentCount
          if (this.data.feed) {
            this.setData({
              'feed.commentCount': Math.max(0, (this.data.feed.commentCount || 0) - 1),
            });
          }
        } catch (err) {
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  /**
   * 点赞动态
   */
  async toggleLike() {
    const { feed, feedId } = this.data;
    if (!feed) return;

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: {
          action: feed.isLiked ? 'unlike' : 'like',
          feedId,
        },
      });

      if (result.success) {
        this.setData({
          'feed.isLiked': !feed.isLiked,
          'feed.likeCount': (feed.likeCount || 0) + (feed.isLiked ? -1 : 1),
        });
      }
    } catch (err) {
      console.error('点赞失败:', err);
    }
  },

  /**
   * 页面显示时（从其他页面返回）
   * 不需要处理，onUnload 统一处理数据回传
   */

  /**
   * 页面卸载时，将评论数变化同步回社区列表页
   */
  onUnload() {
    const feed = this.data.feed;
    if (!feed) return;

    const pages = getCurrentPages();
    // 往前找 community 页面
    for (let i = pages.length - 2; i >= 0; i--) {
      const page = pages[i];
      if (page.route === 'pages/community/community') {
        const feeds = page.data.feeds || [];
        const idx = feeds.findIndex(f => f._id === this.data.feedId);
        if (idx !== -1) {
          page.setData({
            [`feeds[${idx}].commentCount`]: feed.commentCount || 0,
          });
        }
        break;
      }
    }
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls });
  },

  /**
   * 跳转猫咪详情
   */
  goToCatDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/cat/detail/detail?id=${id}` });
  },
});
