/**
 * 个人中心页
 */
const app = getApp();

Page({
  data: {
    userInfo: null,
    isLoggedIn: false,
    menuItems: [
      { icon: '📝', label: '我的动态', desc: '我发布的动态', url: '/pages/user/my-feeds/my-feeds' },
      { icon: '🐱', label: '我的猫咪', desc: '家养猫档案', url: '/pages/user/my-cats/my-cats' },
      { icon: '🐾', label: '我创建的流浪猫', desc: '含合并数据', url: '/pages/user/my-strays/my-strays' },
      { icon: '🔗', label: '合并审核', desc: '处理猫咪档案合并申请', url: '/pages/user/merge-review/merge-review' },
      { icon: '💕', label: '我参与的众筹', desc: '捐款记录', url: '/pages/user/my-crowd/my-crowd?tab=donated' },
      { icon: '📋', label: '我发起的众筹', desc: '含报销入口', url: '/pages/user/my-crowd/my-crowd?tab=initiated' },
    ],
  },

  onShow() {
    this.checkUser();
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
          // 清除全局登录状态
          app.globalData.userInfo = null;
          app.globalData.openid = null;
          app.globalData.isLoggedIn = false;

          // 清除本地缓存
          wx.removeStorageSync('userInfo');

          // 更新页面状态
          this.setData({
            userInfo: null,
            isLoggedIn: false,
          });

          wx.showToast({ title: '已退出登录', icon: 'success' });
        }
      },
    });
  },
});
