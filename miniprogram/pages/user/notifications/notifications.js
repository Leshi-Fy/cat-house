/**
 * 消息中心页
 */
const { timeAgo } = require('../../../utils/util');
const app = getApp();

Page({
  data: {
    activeTab: 'like',   // 'like' | 'comment' | 'donate'
    items: [],
    isLoading: false,
    hasMore: true,
    page: 0,
    pageSize: 20,
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
    // 每次进入刷新未读数
    this.loadUnreadCount();
  },

  /** 切换 Tab */
  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (tab === this.data.activeTab) return;
    this.setData({ activeTab: tab, items: [], page: 0, hasMore: true });
    this.loadList(true);
  },

  /** 加载未读数量 */
  async loadUnreadCount() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'notify-operations',
        data: { action: 'unreadCount' },
      });
      if (result.success) {
        this.setData({ unread: result });
        // 更新全局角标
        if (app.globalData) {
          app.globalData.unreadCount = result.total || 0;
        }
      }
    } catch (err) {
      console.error('获取未读数失败:', err);
    }
  },

  /** 加载通知列表 */
  async loadList(reset = false) {
    if (this.data.isLoading) return;
    const page = reset ? 0 : this.data.page;
    this.setData({ isLoading: true, page });

    try {
      const { result } = await wx.cloud.callFunction({
        name: 'notify-operations',
        data: {
          action: 'list',
          type: this.data.activeTab,
          page,
          pageSize: this.data.pageSize,
        },
      });

      if (result.error) throw new Error(result.error);

      const newItems = (result.data || []).map(item => ({
        ...item,
        formattedTime: timeAgo(item.createTime),
        amountDisplay: item.amount ? (item.amount / 100).toFixed(2) : '0.00',
      }));

      const items = reset ? newItems : [...this.data.items, ...newItems];
      this.setData({
        items,
        isLoading: false,
        hasMore: newItems.length >= this.data.pageSize,
        page: page + 1,
      });
    } catch (err) {
      console.error('加载通知失败:', err);
      this.setData({ isLoading: false });
    }
  },

  loadMore() {
    if (this.data.hasMore && !this.data.isLoading) {
      this.loadList(false);
    }
  },

  /** 全部标为已读 */
  async markAllRead() {
    try {
      await wx.cloud.callFunction({
        name: 'notify-operations',
        data: { action: 'markAllRead', type: this.data.activeTab },
      });
      // 刷新列表和角标
      this.loadList(true);
      this.loadUnreadCount();
    } catch (err) {
      console.error('标为已读失败:', err);
    }
  },

  /** 点击某条通知 */
  async onItemTap(e) {
    const { item } = e.currentTarget.dataset;

    // 标记为已读
    if (!item.isRead) {
      wx.cloud.callFunction({
        name: 'notify-operations',
        data: { action: 'markRead', ids: [item._id] },
      }).then(() => {
        // 更新本地状态
        const items = this.data.items.map(i =>
          i._id === item._id ? { ...i, isRead: true } : i
        );
        this.setData({ items });
        this.loadUnreadCount();
      });
    }

    // 跳转到对应页面
    if (item.type === 'like' || item.type === 'comment') {
      if (item.feedId) {
        wx.navigateTo({ url: `/pages/community/detail/detail?id=${item.feedId}` });
      }
    } else if (item.type === 'donate') {
      if (item.crowdId) {
        wx.navigateTo({ url: `/pages/crowd/detail/detail?id=${item.crowdId}` });
      }
    }
  },
});
