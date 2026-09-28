/**
 * 社区页面
 * 众筹和动态混合瀑布流，按时间倒序
 *
 * 交互对齐微信朋友圈：
 *   - 进入页面只渲染「最新的一屏」（PAGE_SIZE 条），更早的内容不一次性铺开
 *   - 手指上划到列表底部自动加载更早的一页（onReachBottom）
 *   - 从详情页返回 / tab 切回时保留已加载列表和浏览位置，不重新刷新
 *   - 仅首次进入、下拉刷新、发布动态后回到本页才整体刷新
 */
const { timeAgo } = require('../../utils/util');
const CONFIG = require('../../utils/config');

const PAGE_SIZE = 8;   // 每屏展示条数（朋友圈一屏约 5~8 条）
const FETCH_SIZE = 10; // 单次向后端拉取的动态条数（略大于一屏，减少请求）

/**
 * 时间归一化：后端可能返回毫秒数或 "2026-09-28T15:00:00" 字符串，
 * 混合排序前统一成毫秒，否则字符串与数字相减会得到 NaN，顺序错乱。
 */
function toTs(v) {
  if (!v) return 0;
  if (typeof v === 'number') return v;
  const t = Date.parse(String(v).replace(' ', 'T'));
  return isNaN(t) ? 0 : t;
}

Page({
  data: {
    items: [],          // 已展示的统一列表，每项 { type: 'feed'|'crowd', ...原字段 }
    isLoading: false,   // 首屏加载中
    isLoadingMore: false, // 上划加载中
    hasMore: true,
    isEmpty: false,
  },

  // —— 内部状态（不参与渲染）——
  _buffer: [],          // 已拉取但尚未展示的条目，按时间倒序
  _feedPage: 0,         // 动态已拉取的页数
  _crowdLoaded: false,  // 众筹是否已拉过（只拉一次，混入时间线）
  _feedEnd: false,      // 动态是否已全部拉完
  _loading: false,      // 请求锁，防止触底并发

  onLoad() {
    return this.loadPage({ first: true });
  },

  onShow() {
    const app = getApp();
    // 发布/编辑动态后回到社区：整体刷新并回到顶部
    if (app && app.globalData && app.globalData._feedNeedRefresh) {
      app.globalData._feedNeedRefresh = false;
      this.refresh();
      return;
    }
    // 其余情况（详情页返回、tab 切回）保留列表与滚动位置，同朋友圈
  },

  onPullDownRefresh() {
    this.refresh().then(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (!this.data.hasMore || this._loading) return Promise.resolve();
    return this.loadPage();
  },

  /**
   * 整体刷新：清空列表回到顶部，重新只加载最新一屏
   */
  refresh() {
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
    this._buffer = [];
    this._feedPage = 0;
    this._crowdLoaded = false;
    this._feedEnd = false;
    this.setData({ items: [], hasMore: true, isEmpty: false });
    return this.loadPage({ first: true });
  },

  /**
   * 加载一屏（首屏 or 上划加载更早的一屏）
   */
  async loadPage({ first = false } = {}) {
    if (this._loading || !this.data.hasMore) return;
    this._loading = true;
    this.setData({ isLoading: first, isLoadingMore: !first });

    try {
      await this._fillBuffer();
      const take = this._buffer.splice(0, PAGE_SIZE);
      const items = this.data.items.concat(take);
      this.setData({
        items,
        isEmpty: items.length === 0,
        // 缓冲里还有货、或者还有没拉完的数据，就允许继续上划
        hasMore: this._buffer.length > 0 || !this._feedEnd || !this._crowdLoaded,
      });
    } catch (err) {
      console.error('加载社区失败:', err);
      wx.showToast({ title: '加载失败，请稍后重试', icon: 'none' });
    }

    this._loading = false;
    this.setData({ isLoading: false, isLoadingMore: false });
  },

  /**
   * 手动点击「上划加载更多」兜底（触底事件未触发时）
   */
  loadMore() {
    this.loadPage();
  },

  /**
   * 保证缓冲池里至少凑够一屏，不够就继续向后端要
   */
  async _fillBuffer() {
    let guard = 0;
    while (this._buffer.length < PAGE_SIZE && guard++ < 4) {
      if (!this._crowdLoaded) {
        const crowds = await this._fetchCrowdfunds();
        if (!crowds) break; // 拉取失败：保留已加载内容，等下次上划重试（避免连发请求）
        this._crowdLoaded = true;
        this._pushBuffer(crowds);
        continue;
      }
      if (this._feedEnd) break;

      const feeds = await this._fetchFeeds(this._feedPage, FETCH_SIZE);
      if (!feeds) break; // 拉取失败：保留已加载内容，等下次上划重试
      this._feedPage += 1;
      if (feeds.length < FETCH_SIZE) this._feedEnd = true;
      this._pushBuffer(feeds);
      if (feeds.length === 0) break;
    }
  },

  /**
   * 新条目按时间倒序并入缓冲池
   */
  _pushBuffer(list) {
    if (!list || !list.length) return;
    this._buffer = this._buffer
      .concat(list)
      .sort((a, b) => (b.sortTime || 0) - (a.sortTime || 0));
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
      if (result && result.error) throw new Error(result.error);
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
        sortTime: toTs(c.createTime),
      }));
    } catch (err) {
      console.error('加载众筹失败:', err);
      return null; // null 区分「失败」与「空列表」，失败时下次上划会重试
    }
  },

  /**
   * 拉取动态（按时间倒序分页）
   */
  async _fetchFeeds(page, pageSize) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'feed-operations',
        data: { action: 'list', page, pageSize: pageSize || FETCH_SIZE },
      });
      if (result && result.error) throw new Error(result.error);
      return (result.data || []).map(f => ({
        ...f,
        type: 'feed',
        formattedTime: timeAgo(f.createTime),
        sortTime: toTs(f.createTime),
      }));
    } catch (err) {
      console.error('加载动态失败:', err);
      return null;
    }
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
   * 点赞/取消点赞（动态 feed 与众筹 crowd 都支持）
   */
  async toggleLike(e) {
    const { id, type } = e.currentTarget.dataset;
    const item = this.data.items.find(i => i._id === id);
    if (!item) return;

    const isFeed = (type || item.type) === 'feed';
    const action = item.isLiked ? 'unlike' : 'like';

    try {
      const { result } = await wx.cloud.callFunction({
        name: isFeed ? 'feed-operations' : 'crowd-operations',
        data: isFeed
          ? { action, feedId: id }
          : { action, crowdId: id },
      });

      if (result && result.error) throw new Error(result.error);

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
    } catch (err) {
      console.error('点赞失败:', err);
      wx.showToast({
        title: (err && err.message) || '点赞失败，请重试',
        icon: 'none',
      });
    }
  },
});
