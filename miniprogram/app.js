/**
 * 猫屋小程序 - 全局入口
 * 管理用户登录状态、全局数据
 */
App({
  onLaunch() {
    if (!wx.cloud) {
      console.error('请使用 2.2.3 或以上的基础库以使用云能力');
    } else {
      wx.cloud.init({
        env: 'cloud1-3gck8npe4d85d586',
        traceUser: true,
      });
    }
    this.globalData = {
      userInfo: null,
      location: null,
      isLoggedIn: false,
    };
    // 尝试恢复登录状态
    this.checkLogin();
  },

  // 检查登录状态
  checkLogin() {
    const openid = wx.getStorageSync('openid');
    if (openid) {
      this.globalData.isLoggedIn = true;
      this.globalData.openid = openid;
      // 从缓存恢复用户信息
      const userInfo = wx.getStorageSync('userInfo');
      if (userInfo) {
        this.globalData.userInfo = userInfo;
      }
    }
  },

  // 微信登录
  async login() {
    if (this.globalData.isLoggedIn) return this.globalData.userInfo;

    try {
      const { result } = await wx.cloud.callFunction({ name: 'login' });
      if (result && result.openid) {
        wx.setStorageSync('openid', result.openid);
        this.globalData.openid = result.openid;
        this.globalData.isLoggedIn = true;

        if (result.userInfo) {
          this.globalData.userInfo = result.userInfo;
          wx.setStorageSync('userInfo', result.userInfo);
        }
        return result.userInfo || { openid: result.openid };
      }
    } catch (err) {
      console.error('登录失败:', err);
      wx.showToast({ title: '登录失败', icon: 'none' });
    }
    return null;
  },

  // 获取当前位置
  async getLocation() {
    if (this.globalData.location) return this.globalData.location;

    try {
      const res = await wx.getLocation({ type: 'gcj02' });
      this.globalData.location = {
        latitude: res.latitude,
        longitude: res.longitude,
      };
      return this.globalData.location;
    } catch (err) {
      console.error('获取位置失败:', err);
      return null;
    }
  },
});
