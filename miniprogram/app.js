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
  // ⚠️ 启用鉴权后，登录态必须「token + openid」同时存在才算数。
  // 只有 openid 没有 token（升级鉴权前的旧缓存就是这种）不能算已登录：
  // 否则 login() 会被 isLoggedIn 短路、拒绝重新登录，而请求又因缺 token 被后端 401，
  // 形成「页面以为已登录 → 请求 401 → 补登录被跳过 → 永远登不上」的死结。
  checkLogin() {
    const token = wx.getStorageSync('token');
    const openid = wx.getStorageSync('openid');
    // 缺 token 时一并清掉半截状态，避免后续判断被脏数据带偏
    if (!token || !openid) {
      this.globalData.isLoggedIn = false;
      this.globalData.token = token || '';
      this.globalData.openid = openid || '';
      return;
    }
    this.globalData.token = token;
    this.globalData.openid = openid;
    this.globalData.isLoggedIn = true;
    const userInfo = wx.getStorageSync('userInfo');
    if (userInfo) this.globalData.userInfo = userInfo;
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
  // @param {boolean} force 是否强制重新登录。api.js 收到 401 时会传 true —— 此时后端已明确判定
  //                        token 无效，不能再用 isLoggedIn 短路，必须重新走一次 wx.login。
  async login(force = false) {
    if (!force && this.globalData.isLoggedIn && this.globalData.token) {
      return this.globalData.userInfo;
    }
    // 强制重登：先清掉可能已失效的旧 token，避免重放请求时又带上它
    if (force) {
      this.globalData.isLoggedIn = false;
      this.globalData.token = '';
      try {
        wx.removeStorageSync('token');
      } catch (e) {
        /* 忽略：清缓存失败不影响后续写入 */
      }
    }

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
        // 鉴权 token：后续所有请求由 utils/api.js 自动带上
        // （后端 AuthFilter 会校验它，且要求请求里的 openid 与 token 内的一致）
        if (result.token) {
          wx.setStorageSync('token', result.token);
          this.globalData.token = result.token;
        }

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
