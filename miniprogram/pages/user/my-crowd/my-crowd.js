/**
 * 我参与的众筹 / 我发起的众筹
 */
const { query, COLLECTIONS } = require('../../../utils/database');
const { formatMoney, formatDate } = require('../../../utils/util');
const CONFIG = require('../../../utils/config');
const app = getApp();

Page({
  data: {
    activeTab: 'donated', // donated | initiated
    donatedList: [],
    initiatedList: [],
    loading: true,
  },

  onLoad(options) {
    if (options.tab) {
      this.setData({ activeTab: options.tab });
    }
  },

  onShow() {
    this.loadAll();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  async loadAll() {
    this.setData({ loading: true });
    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ loading: false });
      return;
    }

    try {
      const [donated, initiated] = await Promise.all([
        query.where(COLLECTIONS.DONATIONS, { donorId: openid }, 1, 50),
        query.where(COLLECTIONS.CROWDFUNDINGS, { initiatorId: openid }, 1, 50),
      ]);

      this.setData({
        donatedList: donated.map(d => ({
          ...d,
          amountDisplay: formatMoney(d.amount),
          timeText: formatDate(d.createTime, 'YYYY-MM-DD HH:mm'),
        })),
        initiatedList: initiated.map(c => {
          const percent = c.targetAmount > 0 ? Math.round((c.raisedAmount / c.targetAmount) * 100) : 0;
          return {
            ...c,
            raisedDisplay: formatMoney(c.raisedAmount || 0),
            targetDisplay: formatMoney(c.targetAmount || 0),
            percent,
            typeText: CONFIG.CROWD_TYPE_TEXT[c.crowdType] || c.crowdType,
          };
        }),
        loading: false,
      });
    } catch (err) {
      console.error('加载众筹数据失败:', err);
      this.setData({ loading: false });
    }
  },

  onTapInitiated(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/crowd/detail/detail?id=${id}` });
  },

  onGoReceipt(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/crowd/receipt/receipt?id=${id}` });
  },
});
