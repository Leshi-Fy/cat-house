/**
 * 猫屋小程序 · 后端适配层（Supabase / MemFire Cloud）
 * ------------------------------------------------------------
 * 本文件把微信云开发的三类调用重定向到 Supabase：
 *   wx.cloud.callFunction  -> Supabase Edge Function (api)
 *   wx.cloud.database()    -> 通用数据库代理（同一个 Edge Function 的 db 操作）
 *   wx.cloud.uploadFile    -> Edge Function 文件上传代理
 * 业务页面（pages/*）无需任何改动，只改了 app.js 与本项目。
 *
 * ⚠️ 部署前请修改下面两个常量（当前值已指向 NAS 自托管 Supabase）：
 *   SUPABASE_URL —— Supabase 服务地址
 *   ANON_KEY     —— Supabase 的 anon/public key
 *
 * 当前状态（NAS 自托管，局域网联调）：
 *   http://192.168.1.50:8000
 *   → 在微信开发者工具「详情 → 本地设置」勾选「不校验合法域名」即可联调
 *   → 正式发布前改成 Cloudflare Tunnel 的 https 域名（见 nas-supabase/README.md 步骤 8）
 */

// ============ 配置（NAS 自托管 Supabase） ============
const SUPABASE_URL = 'http://192.168.1.50:8000'; // TODO: 发布前改成 https://你的tunnel域名（不要带 /functions/v1）
const ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzg5MzcwODYxLCJleHAiOjE5NDcwNTA4NjF9.hm0sD-O_aznmCCo4PzWNICykH8k5YvRJ6yq20x-TdeY'; // 取自 nas-supabase/.env 的 ANON_KEY
const FUNCTION_URL = SUPABASE_URL + '/functions/v1/api';      // Edge Function 调用地址
// ==============================================

// ---------- 通用请求（替代 wx.cloud.callFunction） ----------
function requestWithRetry(url, options, retries = 2) {
  return new Promise((resolve, reject) => {
    const doRequest = (left) => {
      const start = Date.now();
      wx.request({
        url,
        timeout: 15000,
        ...options,
        success: (res) => resolve(res),
        fail: (err) => {
          const isTimeout = err && (err.errMsg || '').includes('TIMEOUT');
          console.warn(`[supabase] request fail (${isTimeout ? 'timeout' : 'network'}), retries left ${left}:`, err);
          if (left > 0 && isTimeout) {
            setTimeout(() => doRequest(left - 1), 800);
          } else {
            reject(err);
          }
        },
      });
    };
    doRequest(retries);
  });
}

function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    const openid = wx.getStorageSync('openid');
    const body = { name, ...data };
    if (openid) body.openid = openid;

    requestWithRetry(FUNCTION_URL, {
      method: 'POST',
      header: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer ' + ANON_KEY,
        apikey: ANON_KEY,
      },
      data: body,
    }).then((res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        resolve(res.data); // res.data = { result: <payload> }
      } else {
        reject({ code: res.statusCode, message: '请求失败(' + res.statusCode + ')' });
      }
    }).catch((err) => {
      const isTimeout = err && (err.errMsg || '').includes('TIMEOUT');
      reject({ code: -1, message: isTimeout ? '连接服务器超时，请检查网络或切换国内节点' : (err.errMsg || '网络错误') });
    });
  });
}

// ---------- 数据库查询构造器（替代 wx.cloud.database()） ----------
// 支持前端 utils/database.js 及页面直接使用的链式调用：
//   .collection(name).doc(id).get() / .update({data}) / .remove()
//   .collection(name).where(cond).orderBy(f,d).skip(n).limit(n).get() / .count()
//   db.command / db.Geo.Point / db.RegExp / db.serverDate
function database() {
  const dbObj = {};

  dbObj.command = {
    in: (arr) => ({ __in: arr }),
    gt: (v) => ({ __gt: v }),
    gte: (v) => ({ __gte: v }),
    lt: (v) => ({ __lt: v }),
    lte: (v) => ({ __lte: v }),
    neq: (v) => ({ __neq: v }),
    eq: (v) => v,
  };

  dbObj.RegExp = (opts) => ({ __regex: opts.regexp, __flags: opts.options });
  dbObj.Geo = { Point: (lng, lat) => ({ type: 'Point', coordinates: [lng, lat] }) };
  dbObj.serverDate = () => new Date().toISOString();

  dbObj.collection = (name) => collectionProxy(name);
  return dbObj;
}

function collectionProxy(name) {
  const pending = { collection: name };

  const queryProxy = () => ({
    where: (cond) => { pending.where = cond; return queryProxy(); },
    orderBy: (field, dir) => { pending.orderBy = { field, dir }; return queryProxy(); },
    skip: (n) => { pending.skip = n; return queryProxy(); },
    limit: (n) => { pending.limit = n; return queryProxy(); },
    get: () =>
      callFunction('db', {
        op: 'list',
        collection: name,
        where: pending.where,
        orderBy: pending.orderBy,
        skip: pending.skip || 0,
        limit: pending.limit || 100,
      }).then((r) => r.result),
    count: () =>
      callFunction('db', { op: 'count', collection: name, where: pending.where }).then((r) => r.result),
  });

  return {
    doc: (id) => ({
      get: () => callFunction('db', { op: 'get', collection: name, id }).then((r) => r.result),
      update: (obj) => callFunction('db', { op: 'update', collection: name, id, data: obj.data }).then((r) => r.result),
      remove: () => callFunction('db', { op: 'remove', collection: name, id }).then((r) => r.result),
    }),
    where: (cond) => { pending.where = cond; return queryProxy(); },
    add: (obj) => callFunction('db', { op: 'add', collection: name, data: obj.data }).then((r) => r.result),
  };
}

// ---------- 图片上传（替代 wx.cloud.uploadFile） ----------
// 调用约定：wx.cloud.uploadFile({ cloudPath, filePath, success, fail })
// 成功后 resolve({ fileID: <公开访问 URL> })，与云开发 fileID 用法一致（可直接当图片 src）
function uploadFile(options) {
  const { cloudPath, filePath, success, fail } = options;
  const isTimeout = (e) => e && (e.errMsg || '').includes('TIMEOUT');

  const doUpload = (left) => {
    wx.uploadFile({
      url: FUNCTION_URL,
      filePath,
      name: 'file',
      timeout: 30000,
      header: {
        Authorization: 'Bearer ' + ANON_KEY,
        apikey: ANON_KEY,
      },
      formData: { cloudPath },
      success: (r) => {
        try {
          const res = JSON.parse(r.data);
          if (res.result && res.result.fileID) {
            success && success({ fileID: res.result.fileID, statusCode: r.statusCode });
          } else {
            console.error('[supabase upload] failed:', r.statusCode, res);
            fail && fail({ errMsg: '上传失败: ' + (res.result?.error || JSON.stringify(res.result)) });
          }
        } catch (e) {
          console.error('[supabase upload] parse error', r.data);
          fail && fail({ errMsg: '上传失败(解析错误)' });
        }
      },
      fail: (e) => {
        console.warn(`[supabase upload] upload fail, retries left ${left}:`, e);
        if (left > 0 && isTimeout(e)) {
          setTimeout(() => doUpload(left - 1), 800);
        } else {
          const msg = isTimeout(e) ? '上传超时，请检查网络或切换国内节点' : (e.errMsg || '上传失败');
          fail && fail({ errMsg: msg });
        }
      },
    });
  };

  doUpload(2);
}

module.exports = { callFunction, database, uploadFile, SUPABASE_URL, ANON_KEY };
