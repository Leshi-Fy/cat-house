/**
 * 猫屋小程序 · 后端适配层（Java Spring Boot REST 版）
 * ------------------------------------------------------------
 * 本文件把微信云开发的三类调用重定向到 Java 后端（标准 REST）：
 *   wx.cloud.callFunction  -> 各资源 Controller（按 name+action 路由）
 *   wx.cloud.database()    -> 通用数据库代理 POST /api/db
 *   wx.cloud.uploadFile    -> POST /api/upload
 * 业务页面（pages/*）无需任何改动，只改了 app.js 与本项目。
 *
 * 与 Deno/Supabase 版（utils/supabase.js）对外接口完全一致：
 *   callFunction 返回 { result: <payload> }（与云开发返回结构一致）
 *   database() 代理返回 { data: ... } 信封
 *   uploadFile 成功时回调 success({ fileID })
 *
 * ⚠️ 环境切换：统一在 utils/env.js 中修改 ENV（'dev' | 'test' | 'prod'），
 *    详见该文件说明。优先级：Storage 临时覆盖 cathouse_api_base > env.js 配置。
 *    —— 微信正式发布禁止纯 IP / HTTP，prod 必须用备案域名 + 受信任证书。
 *    —— 端口须与后端 server.port 一致（当前 8787）。
 */

// ============ 配置 ============
// 后端基址从环境配置读取（utils/env.js），端口须与后端 server.port 一致（8787）
const env = require('./env.js');

function getBaseUrl() {
  // 1) 临时覆盖：开发者工具 Storage 写入 cathouse_api_base 可运行时换地址，免改码
  const override = wx.getStorageSync('cathouse_api_base');
  if (override && typeof override === 'string' && override.trim()) {
    return override.trim().replace(/\/+$/, '');
  }
  // 2) 环境配置（dev / test / prod）
  return (env.apiBaseUrl || '').replace(/\/+$/, '');
}

// ============ 通用请求（替代 wx.cloud.callFunction / wx.request） ============
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
          console.warn(`[api] request fail (${isTimeout ? 'timeout' : 'network'}), retries left ${left}:`, err);
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

// 把参数对象拼成查询串，跳过 null/undefined
function qs(params) {
  if (!params) return '';
  const parts = [];
  for (const k of Object.keys(params)) {
    const v = params[k];
    if (v === null || v === undefined || v === '') continue;
    parts.push(encodeURIComponent(k) + '=' + encodeURIComponent(v));
  }
  return parts.length ? '?' + parts.join('&') : '';
}

// 归一化 Java 的 Result.data 为 Deno 的 result 信封：
//   - null/undefined  -> { success: true }（写操作成功）
//   - 数组            -> 原样返回（Deno 仅 merge list 为裸数组）
//   - 对象            -> 自动补 success:true（与 Deno 的 success:true 一致）
//   - 其他            -> 原样返回
function normalize(data) {
  if (data === null || data === undefined) return { success: true };
  if (Array.isArray(data)) return data;
  if (typeof data === 'object') return Object.assign({}, data, { success: true });
  return data;
}

// ============ name + action -> REST 路由 ============
function buildRequest(name, data) {
  const d = data || {};
  switch (name) {
    case 'login':
      return { method: 'POST', path: '/api/auth/login', body: { code: d.code } };

    case 'cat-operations':
      switch (d.action) {
        case 'create': return { method: 'POST', path: '/api/cats', body: { catData: d.catData } };
        case 'nearby': return { method: 'GET', path: '/api/cats/nearby', query: { latitude: d.latitude, longitude: d.longitude, page: d.page, pageSize: d.pageSize } };
        case 'detail': return { method: 'GET', path: '/api/cats/' + d.catId };
        case 'update': return { method: 'PUT', path: '/api/cats/' + d.catId, body: { updateData: d.updateData } };
        case 'myCats': return { method: 'GET', path: '/api/cats/my' };
      }
      break;

    case 'feed-operations':
      switch (d.action) {
        case 'create': return { method: 'POST', path: '/api/feeds', body: { content: d.content, photos: d.photos, catId: d.catId } };
        case 'list': return { method: 'GET', path: '/api/feeds', query: { page: d.page, pageSize: d.pageSize } };
        case 'myFeeds': return { method: 'GET', path: '/api/feeds/my', query: { page: d.page, pageSize: d.pageSize } };
        case 'update': return { method: 'PUT', path: '/api/feeds/' + d.feedId, body: { content: d.content, photos: d.photos, catId: d.catId } };
        case 'like': return { method: 'POST', path: '/api/feeds/' + d.feedId + '/like' };
        case 'unlike': return { method: 'DELETE', path: '/api/feeds/' + d.feedId + '/like' };
        case 'delete': return { method: 'DELETE', path: '/api/feeds/' + d.feedId };
        case 'getDetail': return { method: 'GET', path: '/api/feeds/' + d.feedId };
        case 'addComment': return { method: 'POST', path: '/api/feeds/' + d.feedId + '/comments', body: { content: d.content, parentId: d.parentId } };
        case 'listComments': return { method: 'GET', path: '/api/feeds/' + d.feedId + '/comments', query: { page: d.page, pageSize: d.pageSize } };
        case 'listReplies': return { method: 'GET', path: '/api/feeds/comments/' + d.commentId + '/replies' };
        case 'deleteComment': return { method: 'DELETE', path: '/api/feeds/comments/' + d.commentId };
      }
      break;

    case 'crowd-operations':
      switch (d.action) {
        case 'create': return { method: 'POST', path: '/api/crowdfundings', body: { crowdData: d.crowdData } };
        case 'list': return { method: 'GET', path: '/api/crowdfundings', query: { status: d.status, page: d.page, pageSize: d.pageSize } };
        case 'detail': return { method: 'GET', path: '/api/crowdfundings/' + d.crowdId, query: { openid: d.openid } };
        case 'like': return { method: 'POST', path: '/api/crowdfundings/' + d.crowdId + '/like' };
        case 'unlike': return { method: 'DELETE', path: '/api/crowdfundings/' + d.crowdId + '/like' };
        case 'addComment': return { method: 'POST', path: '/api/crowdfundings/' + d.crowdId + '/comments', body: { content: d.content, parentId: d.parentId } };
        case 'listComments': return { method: 'GET', path: '/api/crowdfundings/' + d.crowdId + '/comments', query: { page: d.page, pageSize: d.pageSize } };
        case 'listReplies': return { method: 'GET', path: '/api/crowdfundings/comments/' + d.commentId + '/replies' };
        case 'deleteComment': return { method: 'DELETE', path: '/api/crowdfundings/comments/' + d.commentId };
        case 'apply_receipt': return { method: 'POST', path: '/api/crowdfundings/' + d.crowdId + '/receipts', body: { amount: d.amount, remark: d.remark, receipts: d.receipts } };
        case 'approve_receipt': return { method: 'POST', path: '/api/crowdfundings/' + d.crowdId + '/receipts/approve', body: { approved: d.approved } };
        case 'complete_crowd': return { method: 'POST', path: '/api/crowdfundings/' + d.crowdId + '/complete', body: {} };
      }
      break;

    case 'payment-operations':
      switch (d.action) {
        case 'demo_donate': return { method: 'POST', path: '/api/payments/donate', body: { crowdId: d.crowdId, amount: d.amount, donorName: d.donorName } };
        case 'create_order': return { method: 'POST', path: '/api/payments/orders', body: { crowdId: d.crowdId, amount: d.amount } };
      }
      break;

    case 'notify-operations':
      switch (d.action) {
        // type 为 all/空 时不带 type 参数，后端即返回全部类型（赞 / 评论 / 捐款 混合，按时间倒序）
        case 'list': return { method: 'GET', path: '/api/notifications', query: { type: d.type && d.type !== 'all' ? d.type : null, page: d.page, pageSize: d.pageSize } };
        case 'unreadCount': return { method: 'GET', path: '/api/notifications/unread-count' };
        case 'markRead': return { method: 'POST', path: '/api/notifications/read', body: { ids: d.ids } };
        case 'markAllRead': return { method: 'POST', path: '/api/notifications/read-all', body: { type: d.type } };
      }
      break;

    case 'merge-operations':
      switch (d.action) {
        case 'create': return { method: 'POST', path: '/api/merge-requests', body: { fromCatId: d.fromCatId, toCatId: d.toCatId, note: d.note } };
        case 'approve': return { method: 'POST', path: '/api/merge-requests/' + d.requestId + '/approve', body: {} };
        case 'reject': return { method: 'POST', path: '/api/merge-requests/' + d.requestId + '/reject', body: { reason: d.reason } };
        case 'list': return { method: 'GET', path: '/api/merge-requests', query: { status: d.status, userId: d.userId } };
      }
      break;

    case 'db':
      // 通用数据库代理：直接转发整个 body 到 /api/db
      return { method: 'POST', path: '/api/db', body: d };
  }
  return null;
}

// ============ callFunction（替代 wx.cloud.callFunction） ============
function callFunction(name, data = {}) {
  return new Promise((resolve, reject) => {
    const req = buildRequest(name, data);
    if (!req) {
      reject({ code: -1, message: '未知服务: ' + name });
      return;
    }

    const openid = wx.getStorageSync('openid');
    let body = req.body;
    let query = req.query || {};
    if (req.method === 'POST' || req.method === 'PUT') {
      body = Object.assign({}, body);
      query = Object.assign({}, query);
      if (openid) {
        if (body.openid === undefined) body.openid = openid;
        // 后端部分接口用 @RequestParam("openid") 从 query 取值（如点赞/取消点赞），
        // 只放 body 会报 Required request parameter 'openid' is not present，故两处都带。
        if (query.openid === undefined) query.openid = openid;
      }
    } else {
      query = Object.assign({}, query);
      if (openid && query.openid === undefined) query.openid = openid;
    }

    const url = getBaseUrl() + req.path + qs(query);
    const isJson = req.method === 'POST' || req.method === 'PUT';

    requestWithRetry(url, {
      method: req.method,
      header: { 'Content-Type': 'application/json' },
      data: isJson ? body : undefined,
    }).then((res) => {
      if (res.statusCode >= 200 && res.statusCode < 300) {
        const payload = res.data; // { code, message, data }
        const code = payload && payload.code;
        if (code === 0 || code === undefined) {
          // 成功：归一化为 Deno 的 { result: payload }
          resolve({ result: normalize(payload ? payload.data : null) });
        } else {
          // 业务错误：与 Deno 一致，解析为 { result: { error: message } }
          resolve({ result: { error: (payload && payload.message) || '请求失败' } });
        }
      } else {
        reject({ code: res.statusCode, message: '请求失败(' + res.statusCode + ')' });
      }
    }).catch((err) => {
      const isTimeout = err && (err.errMsg || '').includes('TIMEOUT');
      reject({
        code: -1,
        message: isTimeout ? '连接服务器超时，请检查网络或后端地址' : (err && err.errMsg || '网络错误'),
      });
    });
  });
}

// ============ 数据库查询构造器（替代 wx.cloud.database()） ============
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

// ============ 图片上传（替代 wx.cloud.uploadFile） ============
// 调用约定：wx.cloud.uploadFile({ cloudPath, filePath, success, fail })
// 成功后 success({ fileID: <公开访问 URL> })，与云开发 fileID 用法一致（可直接当图片 src）
function uploadFile(options) {
  const { cloudPath, filePath, success, fail } = options;
  const isTimeout = (e) => e && (e.errMsg || '').includes('TIMEOUT');

  const doUpload = (left) => {
    wx.uploadFile({
      url: getBaseUrl() + '/api/upload',
      filePath,
      name: 'file',
      timeout: 30000,
      formData: { cloudPath: cloudPath || '' },
      success: (r) => {
        try {
          const res = JSON.parse(r.data); // { code, message, data: { fileID } }
          if (res.code === 0 && res.data && res.data.fileID) {
            success && success({ fileID: res.data.fileID, statusCode: r.statusCode });
          } else {
            console.error('[api upload] failed:', r.statusCode, res);
            fail && fail({ errMsg: '上传失败: ' + (res.message || JSON.stringify(res)) });
          }
        } catch (e) {
          console.error('[api upload] parse error', r.data);
          fail && fail({ errMsg: '上传失败(解析错误)' });
        }
      },
      fail: (e) => {
        console.warn(`[api upload] upload fail, retries left ${left}:`, e);
        if (left > 0 && isTimeout(e)) {
          setTimeout(() => doUpload(left - 1), 800);
        } else {
          const msg = isTimeout(e) ? '上传超时，请检查网络或后端地址' : (e.errMsg || '上传失败');
          fail && fail({ errMsg: msg });
        }
      },
    });
  };

  doUpload(2);
}

module.exports = { callFunction, database, uploadFile, getBaseUrl, env };
