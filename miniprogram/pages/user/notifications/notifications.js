/**
 * 消息中心页：全部 / 赞 / 评论 / 捐款 四个 Tab
 * ------------------------------------------------------------
 * 数据来自 Java 后端 /api/notifications（由 utils/api.js 的 notify-operations 路由）。
 * 每条通知都带目标信息（targetType / targetTitle / targetPhoto / targetExists），
 * 点击即可跳到社区里对应的动态或众筹详情。
 *
 * 分页规则（产品约定）：
 *   - 进入页面先看「未读」：当前 Tab 有未读就只展示未读（一次最多 20 条），
 *     没有未读则只展示最近 3 条 —— 首屏不铺满，避免一进来就被历史消息淹没
 *   - 上滑到底自动加载更早的 10 条历史（按时间倒序），直到全部加载完
 *   - 下拉刷新重新走首屏规则（有未读看未读，没有就看最近 3 条）
 *   - 后端对「自己赞/评论自己的内容」也生成通知（isSelf=true），展示为「你」
 *
 * ⚠️ 首屏用 unreadOnly 只拉未读，但后端返回的 total 恒为该 Tab 的全量总数，
 *    前端靠 items.length < total 判断还有没有更早的历史可翻；
 *    total 若被 is_read 过滤掉，会提前判定「已全部加载」。
 */
const { timeAgo } = require('../../../utils/util');
const api = require('../../../utils/api');

const PAGE_SIZE = 10;        // 上滑加载的每页条数
const PREVIEW_SIZE = 3;      // 没有未读时，首屏只展示最近 3 条
const MAX_UNREAD_ONCE = 20;  // 首屏一次最多拉多少条未读

const TAB_EMPTY_TEXT = {
  all: '暂无消息',
  like: '暂无点赞消息',
  comment: '暂无评论消息',
  donate: '暂无捐款消息',
};

/**
 * 通知动作文案
 * - 别人对我：赞了你的动态 / 评论了你的众筹
 * - 我自己（发帖人本人）：你赞了自己的动态（这类通知也要展示，方便回看自己的互动）
 */
function buildActionText(item) {
  const crowd = item.targetType === 'crowd';
  if (item.isSelf) {
    if (item.type === 'like') return crowd ? '你赞了自己的众筹' : '你赞了自己的动态';
    if (item.type === 'comment') return crowd ? '你评论了自己的众筹' : '你评论了自己的动态';
    return '你为自己的众筹捐了款';
  }
  if (item.type === 'like') return crowd ? '赞了你的众筹' : '赞了你的动态';
  if (item.type === 'comment') return crowd ? '评论了你的众筹' : '评论了你的动态';
  return '捐款了你发起的众筹';
}

Page({
  data: {
    activeTab: 'all',    // 'all' | 'like' | 'comment' | 'donate'
    items: [],
    total: 0,            // 当前 Tab 下的总数（后端返回）
    isLoading: false,
    hasMore: true,
    page: 0,
    emptyText: TAB_EMPTY_TEXT.all,
    unread: {
      total: 0,
      likeCount: 0,
      commentCount: 0,
      donateCount: 0,
    },
  },

  // ⚠️ 必须先 await 未读数再拉首屏：首屏要按未读数决定「拉未读还是拉最近 3 条」，
  // 且渲染完会立刻触发 autoMarkReadIfNeeded（它按 this.data.unread 判断有没有未读）。
  // 若并发，列表可能先返回而此时 unread 还是 0，自动标记就会被误跳过。
  async onLoad() {
    await this.loadUnreadCount();
    await this.loadFirstScreen();
  },

  async onShow() {
    // 从详情页返回：只同步未读角标，不重置列表 —— 否则刚点开一条消息，
    // 返回后未读归 0，列表会缩回「最近 3 条」，浏览位置也丢了
    await this.loadUnreadCount();
  },

  onPullDownRefresh() {
    this.loadUnreadCount()
      .then(() => this.loadFirstScreen())
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  /** 上滑到底：自动加载更早的 10 条 */
  onReachBottom() {
    return this.loadMorePage();
  },

  /** 切换 Tab：按该 Tab 的未读数重新走首屏规则 */
  async switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({
      activeTab: tab,
      items: [],
      total: 0,
      page: 0,
      hasMore: true,
      emptyText: TAB_EMPTY_TEXT[tab] || '暂无消息',
    });
    await this.loadFirstScreen();
  },

  /** 加载未读数量（顺带同步首页铃铛角标） */
  async loadUnreadCount() {
    if (!wx.getStorageSync('openid')) return;
    try {
      const { result } = await api.callFunction('notify-operations', { action: 'unreadCount' });
      if (!result || result.error) throw new Error((result && result.error) || '未读数获取失败');

      const unread = {
        total: result.total || 0,
        likeCount: result.likeCount || 0,
        commentCount: result.commentCount || 0,
        donateCount: result.donateCount || 0,
      };
      this.setData({ unread });
      const app = getApp();
      if (app && app.globalData) app.globalData.unreadCount = unread.total;
    } catch (err) {
      console.error('获取未读数失败:', err);
    }
  },

  /**
   * 首屏：有未读 → 只展示未读；没有未读 → 只展示最近 3 条。
   * 之后的上滑都走 loadMorePage() 翻更早的历史。
   */
  async loadFirstScreen() {
    if (!wx.getStorageSync('openid')) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }
    if (this.data.isLoading) return;

    const tab = this.data.activeTab;
    const unreadOfTab = this._unreadOfTab(tab);
    // 有未读：一次把未读拉完（上限 20，太多就只取最新的 20 条，其余混在历史里翻）
    // 无未读：只展示最近 3 条
    const firstSize = unreadOfTab > 0
      ? Math.min(Math.max(unreadOfTab, PREVIEW_SIZE), MAX_UNREAD_ONCE)
      : PREVIEW_SIZE;

    this.setData({ isLoading: true, items: [], page: 0, hasMore: true });

    try {
      const { result } = await api.callFunction('notify-operations', {
        action: 'list',
        type: tab,                       // 'all' 时 api.js 不传 type，后端返回全部类型
        unreadOnly: unreadOfTab > 0,     // 有未读时首屏只要未读
        page: 0,
        pageSize: firstSize,
      });
      if (!result || result.error) throw new Error((result && result.error) || '加载失败');

      const list = Array.isArray(result.data) ? result.data : [];
      const total = typeof result.total === 'number' ? result.total : list.length;
      const items = list.map(item => this._decorate(item));

      this.setData({
        items,
        total,
        isLoading: false,
        // 历史分页的起点：首屏这几条一定是全量里最新的，直接按条数跳过对应页数，
        // 免得第一二次上滑拉回来的全是已经展示过的条目（空转请求）。
        // 剩下的重叠部分仍靠 _id 去重兜底。
        page: Math.floor(items.length / PAGE_SIZE),
        hasMore: items.length < total,
      });

      // 未读已经展示出来了 = 用户已经看到 → 当前 Tab 的未读标记直接清掉
      if (unreadOfTab > 0) this.autoMarkReadIfNeeded();
    } catch (err) {
      console.error('加载通知失败:', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  /**
   * 上滑加载更早的一页历史（全量，不再区分是否已读）
   */
  async loadMorePage() {
    if (this.data.isLoading) return;
    if (!this.data.hasMore) return;
    if (!wx.getStorageSync('openid')) return;

    const page = this.data.page;
    this.setData({ isLoading: true });

    try {
      const { result } = await api.callFunction('notify-operations', {
        action: 'list',
        type: this.data.activeTab,
        page,
        pageSize: PAGE_SIZE,
      });
      if (!result || result.error) throw new Error((result && result.error) || '加载失败');

      const list = Array.isArray(result.data) ? result.data : [];
      const total = typeof result.total === 'number' ? result.total : this.data.total;

      // 按 _id 去重：首屏的未读会与历史第 0 页重叠；翻页期间若有新通知插入，
      // OFFSET 分页也可能带出重复项
      const seen = new Set(this.data.items.map(i => i._id));
      const fresh = list.map(item => this._decorate(item)).filter(i => !seen.has(i._id));
      const items = this.data.items.concat(fresh);

      this.setData({
        items,
        total,
        isLoading: false,
        page: page + 1,
        // 以总数为准，避免最后一页恰好满 10 条时多请求一次；最后一页返回空即到底
        hasMore: items.length < total && list.length > 0,
      });
    } catch (err) {
      console.error('加载通知失败:', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  /** 手动点击「加载更多」（触底未触发时的兜底） */
  loadMore() {
    this.loadMorePage();
  },

  /** 当前 Tab 的未读数：all 用总数，其它用对应类型计数 */
  _unreadOfTab(tab) {
    const unread = this.data.unread || {};
    const key = tab === 'all' ? 'total' : tab + 'Count';
    return Number(unread[key]) || 0;
  },

  /** 通知 -> 展示模型（时间文案 / 金额 / 动作文案 / 能否跳转） */
  _decorate(item) {
    return {
      ...item,
      formattedTime: timeAgo(item.createTime),
      amountDisplay: item.amount ? (item.amount / 100).toFixed(2) : '0.00',
      actionText: buildActionText(item),
      // 目标已被删除时只展示历史摘要，不再跳转
      canJump: item.targetExists && !!item.targetType && item.targetType !== 'none',
    };
  },

  /**
   * 打开列表即视为已读：自动清掉当前 Tab 的未读标记
   * - 「全部」Tab → 清所有类型；其它 Tab → 只清该类型
   * - 未读数为 0 时直接返回，所以从详情页返回、切 Tab 等场景不会重复发请求
   * - 清完会刷新未读数，首页铃铛角标（app.globalData.unreadCount）随之同步
   */
  async autoMarkReadIfNeeded() {
    const tab = this.data.activeTab;
    if (!(this._unreadOfTab(tab) > 0)) return;
    if (this._markingRead) return; // 并发保护
    this._markingRead = true;
    try {
      const { result } = await api.callFunction('notify-operations', {
        action: 'markAllRead',
        type: tab,
      });
      if (result && result.error) throw new Error(result.error);
      // 本地立刻置为已读，省一次列表刷新
      this.setData({ items: this.data.items.map(i => ({ ...i, isRead: true })) });
      await this.loadUnreadCount();
    } catch (err) {
      console.error('自动标记已读失败:', err);
    } finally {
      this._markingRead = false;
    }
  },

  /** 全部标为已读 */
  async markAllRead() {
    try {
      const { result } = await api.callFunction('notify-operations', {
        action: 'markAllRead',
        type: this.data.activeTab,
      });
      if (result && result.error) throw new Error(result.error);
      this.setData({ items: this.data.items.map(i => ({ ...i, isRead: true })) });
      wx.showToast({ title: '已全部标为已读', icon: 'none' });
      this.loadUnreadCount();
    } catch (err) {
      console.error('标为已读失败:', err);
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  /** 点击某条通知：先标已读，再跳到社区里对应的内容 */
  async onItemTap(e) {
    const { item } = e.currentTarget.dataset;

    if (!item.isRead) {
      this.markRead(item);
    }

    if (!item.targetExists) {
      wx.showToast({ title: '原内容已被删除', icon: 'none' });
      return;
    }

    if (item.targetType === 'feed' && item.feedId) {
      wx.navigateTo({ url: `/pages/community/detail/detail?id=${item.feedId}` });
    } else if (item.targetType === 'crowd' && item.crowdId) {
      wx.navigateTo({ url: `/pages/crowd/detail/detail?id=${item.crowdId}` });
    } else {
      wx.showToast({ title: '找不到关联内容', icon: 'none' });
    }
  },

  /** 标记单条已读（写后端 + 更新本地） */
  markRead(item) {
    api.callFunction('notify-operations', { action: 'markRead', ids: [item._id] })
      .then(() => {
        const items = this.data.items.map(i => (i._id === item._id ? { ...i, isRead: true } : i));
        this.setData({ items });
        this.loadUnreadCount();
      })
      .catch((err) => console.error('标为已读失败:', err));
  },
});
