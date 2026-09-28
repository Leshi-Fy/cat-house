/**
 * 个人中心页
 */
const app = getApp();
const api = require('../../../utils/api');

// 基础菜单（不含管理员专属项）
const BASE_MENU = [
  { icon: '🔔', label: '消息通知', desc: '赞、评论、捐款提醒', url: '/pages/user/notifications/notifications' },
  { icon: '📝', label: '我的动态', desc: '我发布的动态', url: '/pages/user/my-feeds/my-feeds' },
  { icon: '🐱', label: '我的猫咪', desc: '家养猫档案', url: '/pages/user/my-cats/my-cats' },
  { icon: '🐾', label: '我创建的流浪猫', desc: '含合并数据', url: '/pages/user/my-strays/my-strays' },
  { icon: '🔗', label: '合并审核', desc: '处理猫咪档案合并申请', url: '/pages/user/merge-review/merge-review' },
  { icon: '💕', label: '我参与的众筹', desc: '捐款记录', url: '/pages/user/my-crowd/my-crowd?tab=donated' },
  { icon: '📋', label: '我发起的众筹', desc: '含报销入口', url: '/pages/user/my-crowd/my-crowd?tab=initiated' },
  { icon: '💰', label: '我的钱包', desc: '报销入账与提现', url: '/pages/user/wallet/wallet' },
];

// 管理员专属：报销审核
const ADMIN_MENU = [
  { icon: '✅', label: '报销审核', desc: '通过/驳回报销申请', url: '/pages/user/receipt-review/receipt-review' },
];

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    unreadCount: 0,
    isAdmin: false,
    menuItems: BASE_MENU,
  },

  onShow() {
    this.checkUser();
    this._loadUnreadCount();
    this._loadAdminStatus();
  },

  async _loadUnreadCount() {
    if (!app.globalData.isLoggedIn) return;
    try {
      const { result } = await api.callFunction('notify-operations', { action: 'unreadCount' });
      if (result && !result.error) {
        this.setData({ unreadCount: result.total || 0 });
      }
    } catch (e) {}
  },

  async _loadAdminStatus() {
    if (!app.globalData.isLoggedIn) {
      this.setData({ isAdmin: false, menuItems: BASE_MENU });
      return;
    }
    try {
      const { result } = await api.callFunction('admin-operations', { action: 'status' });
      const isAdmin = !!(result && result.isAdmin);
      this.setData({
        isAdmin,
        menuItems: isAdmin ? BASE_MENU.concat(ADMIN_MENU) : BASE_MENU,
      });
    } catch (e) {
      this.setData({ isAdmin: false, menuItems: BASE_MENU });
    }
  },

  checkUser() {
    const userInfo = app.globalData.userInfo;
    const isLoggedIn = app.globalData.isLoggedIn;
    this.setData({ userInfo, isLoggedIn });
  },

  // 登录
  async onLogin() {
    wx.showLoading({ title: '登录中...' });
    const userInfo = await app.login();
    wx.hideLoading();
    if (userInfo) {
      this.setData({ userInfo, isLoggedIn: true });
    }
  },

  // 跳转菜单
  onMenuTap(e) {
    const { url } = e.currentTarget.dataset;
    if (!this.data.isLoggedIn) {
      this.onLogin();
      return;
    }
    wx.navigateTo({ url });
  },

  // 编辑资料
  onEditProfile() {
    if (!this.data.isLoggedIn) {
      this.onLogin();
      return;
    }
    wx.navigateTo({ url: '/pages/user/edit-profile/edit-profile' });
  },

  // 退出登录
  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '退出后需要重新登录',
      confirmColor: '#FF6B35',
      success: (res) => {
        if (res.confirm) {
          app.globalData.userInfo = null;
          app.globalData.openid = null;
          app.globalData.isLoggedIn = false;
          wx.removeStorageSync('userInfo');
          this.setData({ userInfo: null, isLoggedIn: false });
          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      },
    });
  },
});
