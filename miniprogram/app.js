/**
 * 猫屋小程序 - 全局入口
 * 已迁移到 Supabase / MemFire Cloud 后端（详见 utils/supabase.js）
 * 这里把 wx.cloud 的三类调用重定向到 Supabase，业务页面无需改动。
 */
const supabase = require('./utils/supabase.js');

App({
  onLaunch() {
    // 云开发环境已移除，这里用 Supabase 适配层接管 wx.cloud 的能力
    if (!wx.cloud) wx.cloud = {};
    wx.cloud.init = function () {}; // 兼容旧调用，无操作
    wx.cloud.callFunction = (opts) => supabase.callFunction(opts.name, opts.data);
    wx.cloud.database = () => supabase.database();
    wx.cloud.uploadFile = (opts) => supabase.uploadFile(opts);

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

  // 微信登录（通过 Supabase Edge Function 完成 jscode2session）
  async login() {
    if (this.globalData.isLoggedIn) return this.globalData.userInfo;

    try {
      const { code } = await new Promise((resolve, reject) =>
        wx.login({ success: resolve, fail: reject })
      );
      const { result } = await wx.cloud.callFunction({ name: 'login', data: { code } });
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
