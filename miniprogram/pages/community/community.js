/**
 * 社区页面
 * 众筹和动态混合瀑布流，按时间倒序
 */
const { timeAgo } = require('../../utils/util');
const CONFIG = require('../../utils/config');

Page({
  data: {
    items: [],         // 统一列表，每项 { type: 'feed'|'crowd', ...原字段 }
    isLoading: false,
    hasMore: true,
    page: 0,
    pageSize: 10,
    maxFeeds: 100,
    crowdfundsLoaded: false,
  },

  _loaded: false,

  onLoad() {
    // 首次加载由 onShow 触发，避免双重请求
  },

  onShow() {
    // 每次页面显示时刷新数据（首次加载/tab切换/从子页面返回）
    this.setData({ page: 0, hasMore: true });
    this.loadAll();
  },

  onPullDownRefresh() {
    this.setData({ page: 0, hasMore: true, crowdfundsLoaded: false });
    this.loadAll().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore();
    }
  },

  /**
   * 同时加载众筹+动态，合并排序
   */
  async loadAll() {
    this.setData({ isLoading: true });
    try {
      const [crowds, feeds] = await Promise.all([
        this._fetchCrowdfunds(),
        this._fetchFeeds(0),
      ]);
      this._mergeAndSet(crowds, feeds);
    } catch (err) {
      console.error('加载社区失败:', err);
    }
    this.setData({ isLoading: false });
  },

  /**
   * 加载更多（仅加载更多动态，众筹不再重复拉）
   */
  loadMore() {
    if (this.data.feeds_length >= this.data.maxFeeds) {
      this.setData({ hasMore: false });
      wx.showToast({ title: '已加载全部内容', icon: 'none' });
      return;
    }
    this.setData({ page: this.data.page + 1, isLoading: true });
    this._fetchFeeds(this.data.page).then(newFeeds => {
      // 新动态和已有众筹重新合并
      const oldFeeds = this.data.items.filter(i => i.type === 'feed');
      const crowds = this.data.items.filter(i => i.type === 'crowd');
      const allFeeds = [...oldFeeds, ...newFeeds];
      this._mergeAndSet(crowds, allFeeds);
      this.setData({ isLoading: false });
    });
  },

  /**
   * 拉取众筹
   */
  async _fetchCrowdfunds() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: { action: 'list', status: 'ongoing', page: 0, pageSize: 20 },
      });
      return (result.data || []).map(c => ({
        ...c,
        type: 'crowd',
        targetAmount: (c.targetAmount || 0) / 100,
        raisedAmount: (c.raisedAmount || 0) / 100,
        percent: c.targetAmount > 0 ? Math.min(100, Math.round(((c.raisedAmount || 0) / c.targetAmount) * 100)) : 0,
        targetDisplay: ((c.targetAmount || 0) / 100).toFixed(2),
        raisedDisplay: ((c.raisedAmount || 0) / 100).toFixed(2),
        typeText: CONFIG.CROWD_TYPE_TEXT[c.crowdType] || c.crowdType,
        catName: c.catName || '流浪猫救助',
        formattedTime: timeAgo(c.createTime),
        sortTime: c.createTime || 0,
      }));
    } catch (err) {
      console.error('加载众筹失败:', err);
      return [];
    }
  },

  /**
   * 拉取动态
   */
  async _fetchFeeds(page) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: { action: 'list', page, pageSize: this.data.pageSize },
      });
      if (result.error) throw new Error(result.error);
      return (result.data || []).map(f => ({
        ...f,
        type: 'feed',
        formattedTime: timeAgo(f.createTime),
        sortTime: f.createTime || 0,
      }));
    } catch (err) {
      console.error('加载动态失败:', err);
      return [];
    }
  },

  /**
   * 合并众筹+动态，按时间倒序排列
   */
  _mergeAndSet(crowds, feeds) {
    const all = [...crowds, ...feeds]
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
    this.setData({
      items: all,
      hasMore: feeds.length >= this.data.pageSize && feeds.length < this.data.maxFeeds,
      feeds_length: feeds.length,
    });
  },

  /**
   * 跳转到发布页面
   */
  goToPost() {
    wx.navigateTo({ url: '/pages/community/post/post' });
  },

  /**
   * 跳转到众筹详情
   */
  goToCrowdDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/crowd/detail/detail?id=${id}` });
  },

  /**
   * 跳转到动态详情
   */
  goToDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/community/detail/detail?id=${id}` });
  },

  /**
   * 跳转到猫咪详情
   */
  goToCatDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({ url: `/pages/cat/detail/detail?id=${id}` });
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: urls });
  },

  /**
   * 点赞/取消点赞
   */
  async toggleLike(e) {
    const { id } = e.currentTarget.dataset;
    const item = this.data.items.find(i => i._id === id && i.type === 'feed');
    if (!item) return;

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: { action: item.isLiked ? 'unlike' : 'like', feedId: id },
      });

      if (result.success) {
        const items = this.data.items.map(i => {
          if (i._id === id) {
            return {
              ...i,
              isLiked: !i.isLiked,
              likeCount: (i.likeCount || 0) + (i.isLiked ? -1 : 1),
            };
          }
          return i;
        });
        this.setData({ items });
      }
    } catch (err) {
      console.error('点赞失败:', err);
    }
  },
});
