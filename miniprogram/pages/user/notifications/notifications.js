/**
 * 消息中心页：全部 / 赞 / 评论 / 捐款 四个 Tab
 * ------------------------------------------------------------
 * 数据来自 Java 后端 /api/notifications（由 utils/api.js 的 notify-operations 路由）。
 * 每条通知都带目标信息（targetType / targetTitle / targetPhoto / targetExists），
 * 点击即可跳到社区里对应的动态或众筹详情。
 *
 * 分页规则（产品约定）：
 *   - 默认 Tab 为「全部」，首次进入加载最新 10 条（按时间倒序）
 *   - 上滑到底自动再加载 10 条历史数据，直到全部加载完
 *   - 后端对「自己赞/评论自己的内容」也生成通知（isSelf=true），展示为「你」
 */
const { timeAgo } = require('../../../utils/util');
const api = require('../../../utils/api');

const PAGE_SIZE = 10;

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
    pageSize: PAGE_SIZE,
    emptyText: TAB_EMPTY_TEXT.all,
    unread: {
      total: 0,
      likeCount: 0,
      commentCount: 0,
      donateCount: 0,
    },
  },

  onLoad() {
    this.loadUnreadCount();
    this.loadList(true);
  },

  onShow() {
    // 每次进入刷新未读数与列表（从详情页返回后已读状态要同步）
    this.loadUnreadCount();
    if (this.data.items.length) this.loadList(true);
  },

  onPullDownRefresh() {
    Promise.all([this.loadUnreadCount(), this.loadList(true)])
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  /** 上滑到底：自动加载更早的 10 条 */
  onReachBottom() {
    this.loadList(false);
  },

  /** 切换 Tab */
  switchTab(e) {
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
    this.loadList(true);
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
   * 加载通知列表
   * @param {boolean} reset true=重新加载第一页；false=追加下一页
   */
  async loadList(reset = false) {
    if (this.data.isLoading) return;
    if (!reset && !this.data.hasMore) return;
    if (!wx.getStorageSync('openid')) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    const page = reset ? 0 : this.data.page;
    this.setData({ isLoading: true, page });

    try {
      const { result } = await api.callFunction('notify-operations', {
        action: 'list',
        type: this.data.activeTab,   // 'all' 时 api.js 不传 type，后端返回全部类型
        page,
        pageSize: this.data.pageSize,
      });
      if (!result || result.error) throw new Error((result && result.error) || '加载失败');

      const list = Array.isArray(result.data) ? result.data : [];
      const total = typeof result.total === 'number' ? result.total : list.length;
      const newItems = list.map(item => ({
        ...item,
        formattedTime: timeAgo(item.createTime),
        amountDisplay: item.amount ? (item.amount / 100).toFixed(2) : '0.00',
        actionText: buildActionText(item),
        // 目标已被删除时只展示历史摘要，不再跳转
        canJump: item.targetExists && !!item.targetType && item.targetType !== 'none',
      }));

      // 追加时按 _id 去重：翻页期间若有新通知插入，OFFSET 分页可能带出重复项
      let items;
      if (reset) {
        items = newItems;
      } else {
        const seen = new Set(this.data.items.map(i => i._id));
        items = this.data.items.concat(newItems.filter(i => !seen.has(i._id)));
      }

      this.setData({
        items,
        total,
        isLoading: false,
        // 以总数为准判断是否还有历史数据，避免最后一页恰好满 10 条时多请求一次
        hasMore: items.length < total,
        page: page + 1,
      });
    } catch (err) {
      console.error('加载通知失败:', err);
      this.setData({ isLoading: false });
      wx.showToast({ title: err.message || '加载失败', icon: 'none' });
    }
  },

  /** 手动点击「加载更多」（触底未触发时的兜底） */
  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadList(false);
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
