/**
 * 众筹详情页
 */
const { query, COLLECTIONS } = require('../../../utils/database');
const { formatMoney, timeAgo, formatDate } = require('../../../utils/util');
const CONFIG = require('../../../utils/config');
const app = getApp();

Page({
  data: {
    crowdId: '',
    crowd: null,
    donations: [],
    receipts: [],
    loading: true,
    comments: [],        // 评论列表
    commentText: '',
    hasContent: false,
    isSubmitting: false,
    placeholder: '说点什么...',
    replyTo: null,       // 回复某人 { _id, authorName }
    showAllReplies: {},
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ crowdId: options.id });
      this.loadDetail(options.id);
      this.loadComments(options.id);
    }
  },

  onShow() {
    if (this.data.crowdId) {
      this.loadDetail(this.data.crowdId);
    }
  },

  async loadDetail(id) {
    this.setData({ loading: true });
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: { action: 'detail', crowdId: id },
      });
      if (result && result.error) throw new Error(result.error);
      const crowd = result;
      if (crowd && crowd._id) {
        const percent = crowd.targetAmount > 0
          ? Math.min(100, Math.round((crowd.raisedAmount / crowd.targetAmount) * 100))
          : 0;

        // 计算报销总额
        const receiptRecords = crowd.receiptRecords || [];
        const totalReceiptAmount = receiptRecords.reduce((sum, r) => sum + (r.amount || 0), 0);

        this.setData({
          crowd: {
            ...crowd,
            raisedDisplay: formatMoney(crowd.raisedAmount || 0),
            targetDisplay: formatMoney(crowd.targetAmount || 0),
            percent,
            typeText: CONFIG.CROWD_TYPE_TEXT[crowd.crowdType] || crowd.crowdType,
            deadlineText: formatDate(crowd.deadline, 'YYYY-MM-DD'),
            isExpired: new Date(crowd.deadline) < new Date(),
            isInitiator: app.globalData.openid === crowd.initiatorId,
            totalReceiptAmount: formatMoney(totalReceiptAmount),
          },
          receipts: receiptRecords.map(r => ({
            ...r,
            amountDisplay: formatMoney(r.amount || 0),
            timeText: formatDate(r.createTime, 'YYYY-MM-DD HH:mm'),
            statusText: CONFIG.RECEIPT_STATUS_TEXT[r.status] || '未知',
          })),
          loading: false,
        });

        this.loadDonations(id);
      }
    } catch (err) {
      console.error('加载众筹详情失败:', err);
      this.setData({ loading: false });
    }
  },

  async loadDonations(crowdId) {
    try {
      const donations = await query.where(COLLECTIONS.DONATIONS, { crowdId }, 1, 50);
      const processed = donations.map(d => ({
        ...d,
        amountDisplay: formatMoney(d.amount),
        donateTime: formatDate(d.createTime, 'YYYY-MM-DD HH:mm'),
      }));
      this.setData({ donations: processed });
    } catch (err) {
      console.error('加载捐款记录失败:', err);
    }
  },

  // 参与捐款
  onDonate() {
    const { crowdId } = this.data;
    wx.navigateTo({ url: `/pages/crowd/donate/donate?id=${crowdId}` });
  },

  // 申请报销
  onReceipt() {
    const { crowdId } = this.data;
    wx.navigateTo({ url: `/pages/crowd/receipt/receipt?id=${crowdId}` });
  },

  // 预览发票图片
  previewReceipt(e) {
    const { current, urls } = e.currentTarget.dataset;
    wx.previewImage({ current, urls });
  },

  // 查看猫咪详情
  onGoCat() {
    const { crowd } = this.data;
    if (crowd && crowd.catId) {
      wx.navigateTo({ url: `/pages/cat/detail/detail?id=${crowd.catId}` });
    }
  },

  // ===== 点赞 =====
  async toggleLike() {
    const { crowd, crowdId } = this.data;
    if (!crowd) return;

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: { action: crowd.isLiked ? 'unlike' : 'like', crowdId },
      });
      if (result && result.error) throw new Error(result.error);

      this.setData({
        'crowd.isLiked': !crowd.isLiked,
        'crowd.likeCount': Math.max(0, (crowd.likeCount || 0) + (crowd.isLiked ? -1 : 1)),
      });
    } catch (err) {
      console.error('点赞失败:', err);
      wx.showToast({ title: (err && err.message) || '点赞失败', icon: 'none' });
    }
  },

  // ===== 评论 =====
  // 点评论图标：滚动到评论区
  onFocusComment() {
    const q = wx.createSelectorQuery();
    q.select('.comments-card').boundingClientRect();
    q.selectViewport().scrollOffset();
    q.exec((res) => {
      const rect = res && res[0];
      const scrollTop = (res && res[1] && res[1].scrollTop) || 0;
      if (rect) {
        wx.pageScrollTo({ scrollTop: scrollTop + rect.top - 40, duration: 200 });
      }
    });
  },

  async loadComments(crowdId) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: { action: 'listComments', crowdId },
      });
      if (result && result.error) throw new Error(result.error);

      const comments = (result.data || []).map(c => ({
        ...c,
        formattedTime: timeAgo(c.createTime),
        replies: (c.replies || []).map(r => ({ ...r, formattedTime: timeAgo(r.createTime) })),
      }));
      this.setData({ comments });
    } catch (err) {
      console.error('加载评论失败:', err);
    }
  },

  onCommentInput(e) {
    const val = e.detail.value;
    this.setData({ commentText: val, hasContent: val.trim().length > 0 });
  },

  onReplyTo(e) {
    const { id, name } = e.currentTarget.dataset;
    this.setData({ replyTo: { _id: id, authorName: name }, placeholder: `回复 ${name}` });
  },

  cancelReply() {
    this.setData({ replyTo: null, placeholder: '说点什么...' });
  },

  async submitComment() {
    const { commentText, crowdId, replyTo } = this.data;
    if (!commentText.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }
    if (this.data.isSubmitting) return;
    this.setData({ isSubmitting: true });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: {
          action: 'addComment',
          crowdId,
          content: commentText.trim(),
          parentId: replyTo ? replyTo._id : null,
        },
      });
      if (result && result.error) throw new Error(result.error);

      wx.showToast({ title: '评论成功', icon: 'success' });
      this.setData({
        commentText: '',
        hasContent: false,
        replyTo: null,
        placeholder: '说点什么...',
        isSubmitting: false,
      });
      this.loadComments(crowdId);
      this.setData({
        'crowd.commentCount': (this.data.crowd.commentCount || 0) + 1,
      });
    } catch (err) {
      console.error('评论失败:', err);
      this.setData({ isSubmitting: false });
      wx.showToast({ title: (err && err.message) || '评论失败', icon: 'none' });
    }
  },

  async onViewAllReplies(e) {
    const { id } = e.currentTarget.dataset;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: { action: 'listReplies', commentId: id },
      });
      if (result && result.error) throw new Error(result.error);

      const comments = this.data.comments.map(c => {
        if (c._id === id) {
          return {
            ...c,
            replies: (result.data || []).map(r => ({ ...r, formattedTime: timeAgo(r.createTime) })),
          };
        }
        return c;
      });
      this.setData({ comments, showAllReplies: { ...this.data.showAllReplies, [id]: true } });
    } catch (err) {
      console.error('加载回复失败:', err);
    }
  },

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
            name: 'crowd-operations',
            data: { action: 'deleteComment', commentId: id },
          });
          if (result && result.error) throw new Error(result.error);
          wx.showToast({ title: '已删除', icon: 'success' });
          this.loadComments(this.data.crowdId);
          if (this.data.crowd) {
            this.setData({
              'crowd.commentCount': Math.max(0, (this.data.crowd.commentCount || 0) - 1),
            });
          }
        } catch (err) {
          wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
        }
      },
    });
  },

  // 分享
  onShareAppMessage() {
    const { crowd } = this.data;
    return {
      title: `【${crowd.typeText}众筹】${crowd.catName || '流浪猫救助'} - 猫屋`,
      path: `/pages/crowd/detail/detail?id=${crowd._id}`,
      imageUrl: crowd.catPhoto || crowd.photos?.[0] || '',
    };
  },
});
