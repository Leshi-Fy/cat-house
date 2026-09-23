/**
 * 猫屋小程序 - 全局入口
 * 已迁移到 Java Spring Boot 后端（标准 REST，详见 utils/api.js）
 * 这里把 wx.cloud 的三类调用重定向到 api.js 适配层，业务页面无需改动。
 */
const api = require('./utils/api.js');
const env = require('./utils/env.js');

App({
  onLaunch() {
    console.log('[cat-house] 当前环境:', env.ENV, env.apiBaseUrl);
    // 云开发环境已移除，这里用 Java 后端适配层接管 wx.cloud 的能力
    if (!wx.cloud) wx.cloud = {};
    wx.cloud.init = function () {}; // 兼容旧调用，无操作
    wx.cloud.callFunction = (opts) => api.callFunction(opts.name, opts.data);
    wx.cloud.database = () => api.database();
    wx.cloud.uploadFile = (opts) => api.uploadFile(opts);

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

  // 登录失败统一处理：把「具体原因」显示出来，便于定位（排查期用弹窗，信息完整）
  _loginFail(stage, detail) {
    const msg = `${stage}\n${detail || '未知原因'}`;
    console.error('[cat-house] 登录失败 →', stage, detail);
    wx.showModal({
      title: '登录失败',
      content: msg + '\n\n① 若提示「不在以下 request 合法域名列表」：开发者工具 → 详情 → 本地设置 → 勾选「不校验合法域名」。\n② 若提示 invalid code：确认工具里的 AppID 与后端 application.yml 的 appid 一致，且用真实小程序（非测试号）。',
      showCancel: false,
    });
  },

  // 微信登录（通过 Java 后端 /api/auth/login 完成 jscode2session）
  async login() {
    if (this.globalData.isLoggedIn) return this.globalData.userInfo;

    // 第 1 步：wx.login 拿 code
    let code;
    try {
      const res = await new Promise((resolve, reject) =>
        wx.login({ success: resolve, fail: reject })
      );
      code = res && res.code;
    } catch (err) {
      this._loginFail('① wx.login 失败', (err && err.errMsg) || String(err));
      return null;
    }
    if (!code) {
      this._loginFail('① wx.login 未返回 code', '通常是 AppID 配置问题或未登录开发者工具');
      return null;
    }

    // 第 2 步：把 code 交给后端换 openid
    try {
      const { result } = await wx.cloud.callFunction({ name: 'login', data: { code } });

      // 后端业务错误（api.js 会归一化成 { result: { error } }），原来被静默吞掉了
      if (result && result.error) {
        this._loginFail('② 后端返回错误', result.error);
        return null;
      }
      if (result && result.openid) {
        wx.setStorageSync('openid', result.openid);
        this.globalData.openid = result.openid;
        this.globalData.isLoggedIn = true;

        if (result.userInfo) {
          this.globalData.userInfo = result.userInfo;
          wx.setStorageSync('userInfo', result.userInfo);
        }
        console.log('[cat-house] 登录成功 openid =', result.openid);
        return result.userInfo || { openid: result.openid };
      }
      this._loginFail('② 后端未返回 openid', JSON.stringify(result));
    } catch (err) {
      // 走到这里说明是 HTTP 非 2xx 或网络层失败（域名未放行 / 后端没启动 / 地址不对）
      this._loginFail('③ 请求后端失败', (err && (err.message || err.errMsg)) || String(err));
    }
    return null;
  },

  // 获取当前位置
  // @param {boolean} force 是否忽略缓存重新获取。默认 false（走缓存）；
  //        首页点「📍 重新定位」必须传 true，否则拿到的永远是首次定位结果，点了等于没点。
  async getLocation(force = false) {
    if (!force && this.globalData && this.globalData.location) return this.globalData.location;

    try {
      const res = await wx.getLocation({ type: 'gcj02' });
      if (!this.globalData) this.globalData = {};
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
