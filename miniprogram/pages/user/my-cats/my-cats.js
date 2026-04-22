/**
 * 我的家养猫
 */
const { query, COLLECTIONS } = require('../../../utils/database');
const app = getApp();

Page({
  data: {
    cats: [],
    loading: true,
  },

  onShow() {
    this.loadMyCats();
  },

  async loadMyCats() {
    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ loading: false });
      return;
    }

    this.setData({ loading: true });
    try {
      const cats = await query.where(COLLECTIONS.HOME_CATS, { ownerId: openid }, 1, 50);
      this.setData({ cats, loading: false });
    } catch (err) {
      console.error('加载家养猫失败:', err);
      this.setData({ loading: false });
    }
  },

  // 添加家养猫
  goAddCat() {
    wx.navigateTo({ url: '/pages/user/edit-profile/edit-profile?mode=addCat' });
  },

  // 查看家养猫详情
  goDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/cat/detail/detail?id=${id}&type=home` });
  },
});
