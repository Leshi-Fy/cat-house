/**
 * 我的动态页面
 */
const { timeAgo } = require('../../../utils/util');
const app = getApp();

Page({
  data: {
    feeds: [],
    isLoading: false,
    hasMore: true,
    page: 0,
    pageSize: 10,
  },

  onLoad() {
    this.loadMyFeeds();
  },

  onShow() {
    // 从编辑页返回时刷新
    if (this._needRefresh) {
      this._needRefresh = false;
      this.setData({ page: 0, hasMore: true, feeds: [] });
      this.loadMyFeeds();
    }
  },

  onPullDownRefresh() {
    this.setData({ page: 0, hasMore: true, feeds: [] });
    this.loadMyFeeds().then(() => {
      wx.stopPullDownRefresh();
    });
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadMore();
    }
  },

  /**
   * 加载我的动态
   */
  async loadMyFeeds() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true, loadError: '' });

    try {
      wx.showLoading({ title: '加载中...' });

      const res = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: {
          action: 'myFeeds',
          page: this.data.page,
          pageSize: this.data.pageSize,
        }
      });

      wx.hideLoading();

      const result = res.result || {};

      if (result.error) {
        this.setData({ isLoading: false, loadError: '云函数错误: ' + result.error });
        return;
      }

      // 兼容：有些版本返回 { data: [...] }，有些直接返回数组
      const rawFeeds = Array.isArray(result.data) ? result.data : [];

      if (rawFeeds.length === 0 && this.data.page === 0) {
        this.setData({ feeds: [], isLoading: false, hasMore: false });
        return;
      }

      const feeds = rawFeeds.map(feed => ({
        ...feed,
        formattedTime: timeAgo(feed.createTime),
      }));

      this.setData({
        feeds: this.data.page === 0 ? feeds : [...this.data.feeds, ...feeds],
        hasMore: feeds.length === this.data.pageSize,
        isLoading: false,
      });
    } catch (err) {
      wx.hideLoading();
      console.error('[my-feeds] 异常:', err);
      this.setData({ isLoading: false, loadError: err.errMsg || err.message || '加载失败' });
    }
  },

  /**
   * 加载更多
   */
  loadMore() {
    this.setData({ page: this.data.page + 1 });
    this.loadMyFeeds();
  },

  /**
   * 跳转到发布页面
   */
  goToPost() {
    wx.navigateTo({ url: '/pages/community/post/post' });
  },

  /**
   * 跳转到动态详情
   */
  goToDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/community/detail/detail?id=${id}`
    });
  },

  /**
   * 跳转到猫咪详情
   */
  goToCatDetail(e) {
    const { id } = e.currentTarget.dataset;
    wx.navigateTo({
      url: `/pages/cat/detail/detail?id=${id}`
    });
  },

  /**
   * 编辑动态 - 跳转到 post 页并传入数据
   */
  editFeed(e) {
    const { feed } = e.currentTarget.dataset;
    const feedStr = encodeURIComponent(JSON.stringify(feed));
    wx.navigateTo({
      url: `/pages/community/post/post?feedId=${feed._id}&feed=${feedStr}`,
      events: {
        // 编辑完成后刷新
        onEditComplete: () => {
          this.setData({ page: 0, hasMore: true, feeds: [] });
          this.loadMyFeeds();
        }
      }
    });
  },

  /**
   * 删除动态
   */
  deleteFeed(e) {
    const { id, index } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认删除',
      content: '删除后不可恢复，确定吗？',
      confirmText: '删除',
      confirmColor: '#FF4D4D',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '删除中...' });
        try {
          const { result } = await wx.cloud.callFunction({
            name: 'feed-operations',
            data: { action: 'delete', feedId: id }
          });
          wx.hideLoading();
          if (result.error) throw new Error(result.error);

          // 本地移除这条
          const feeds = [...this.data.feeds];
          feeds.splice(index, 1);
          this.setData({ feeds });
          wx.showToast({ title: '已删除', icon: 'success' });
        } catch (err) {
          wx.hideLoading();
          wx.showToast({ title: err.message || '删除失败', icon: 'none' });
        }
      }
    });
  },

  /**
   * 预览图片
   */
  previewImage(e) {
    const { url, urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls });
  },
});
