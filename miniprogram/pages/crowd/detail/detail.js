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
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ crowdId: options.id });
      this.loadDetail(options.id);
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
      const crowd = await query.getById(COLLECTIONS.CROWDFUNDINGS, id);
      if (crowd) {
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
