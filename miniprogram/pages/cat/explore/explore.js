/**
 * 探索页 - 全部流浪猫列表 / 合并选择模式
 */
const { query, COLLECTIONS, db } = require('../../../utils/database');
const CONFIG = require('../../../utils/config');
const app = getApp();

Page({
  data: {
    cats: [],
    page: 1,
    hasMore: true,
    loading: false,
    loadingMore: false,
    keyword: '',
    // 合并选择模式
    mode: 'browse', // browse | merge
    toCatId: '',
    toCatName: '',
    mergeNote: '',
  },

  onLoad(options) {
    if (options.mode === 'merge' && options.toCatId) {
      this.setData({
        mode: 'merge',
        toCatId: options.toCatId,
        toCatName: decodeURIComponent(options.toCatName || ''),
        mergeNote: decodeURIComponent(options.note || '疑似同一只猫'),
      });
      wx.setNavigationBarTitle({ title: '选择我的猫咪' });
    }
    this.loadCats();
  },

  // 加载猫咪列表
  async loadCats() {
    if (this.data.loadingMore) return;
    this.setData({ loading: true });

    try {
      let condition = {};

      if (this.data.mode === 'merge') {
        // 合并模式下只加载当前用户创建的猫
        const openid = app.globalData.openid;
        if (openid) {
          condition.creatorId = openid;
        }
      } else {
        // 浏览模式下全部加载
        if (this.data.keyword) {
          condition = { name: db.RegExp({ regexp: this.data.keyword, options: 'i' }) };
        }
      }

      const cats = await query.where(COLLECTIONS.STRAY_CATS, condition, this.data.page, 20);
      const processedCats = cats.map(cat => ({
        ...cat,
        healthText: CONFIG.HEALTH_TEXT[cat.healthStatus] || cat.healthStatus,
        sterilizedText: CONFIG.STERILIZED_TEXT[cat.sterilized] || cat.sterilized,
      }));

      this.setData({
        cats: this.data.page === 1 ? processedCats : [...this.data.cats, ...processedCats],
        hasMore: processedCats.length >= 20,
        loading: false,
      });
    } catch (err) {
      console.error('加载列表失败:', err);
      this.setData({ loading: false });
    }
  },

  // 加载更多
  loadMore() {
    if (!this.data.hasMore) return;
    this.setData({
      page: this.data.page + 1,
      loadingMore: true,
    });
    this.loadCats().then(() => {
      this.setData({ loadingMore: false });
    });
  },

  // 搜索
  onSearch(e) {
    this.setData({ keyword: e.detail.value, page: 1 });
    this.loadCats();
  },

  // 点击猫咪
  onTapCat(e) {
    const { id } = e.currentTarget.dataset;

    if (this.data.mode === 'merge') {
      // 合并选择模式，发起合并申请
      this.submitMergeRequest(id);
    } else {
      wx.navigateTo({ url: `/pages/cat/detail/detail?id=${id}` });
    }
  },

  // 提交合并申请
  async submitMergeRequest(fromCatId) {
    const { toCatId, mergeNote } = this.data;
    if (fromCatId === toCatId) {
      wx.showToast({ title: '不能和自己合并', icon: 'none' });
      return;
    }

    try {
      await wx.cloud.callFunction({
        name: 'merge-operations',
        data: { action: 'create', fromCatId, toCatId, note: mergeNote },
      });
      wx.showToast({ title: '合并申请已提交，等待对方审核', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      console.error('合并申请失败:', err);
      wx.showToast({ title: err.errMsg || '提交失败', icon: 'none' });
    }
  },
});
