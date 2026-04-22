/**
 * 我创建的流浪猫（含合并数据）
 */
const { query, COLLECTIONS } = require('../../../utils/database');
const CONFIG = require('../../../utils/config');
const app = getApp();

Page({
  data: {
    cats: [],
    loading: true,
  },

  onShow() {
    this.loadMyStrays();
  },

  async loadMyStrays() {
    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });
    try {
      // 查自己创建的 + 被合并到自己创建的档案
      const myCats = await query.where(COLLECTIONS.STRAY_CATS, { creatorId: openid }, 1, 50);
      const processed = myCats.map(cat => ({
        ...cat,
        healthText: CONFIG.HEALTH_TEXT[cat.healthStatus] || cat.healthStatus,
        sterilizedText: CONFIG.STERILIZED_TEXT[cat.sterilized] || cat.sterilized,
        hasMerge: cat.mergeChain && cat.mergeChain.length > 0,
        aliasText: cat.aliases && cat.aliases.length > 0 ? `又名：${cat.aliases.join(' / ')}` : '',
      }));
      this.setData({ cats: processed, loading: false });
    } catch (err) {
      console.error('加载流浪猫失败:', err);
      this.setData({ loading: false });
    }
  },

  onTapCat(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/cat/detail/detail?id=${id}` });
  },
});
