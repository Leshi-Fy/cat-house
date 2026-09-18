// ============================================================
// 猫屋小程序 · Supabase Edge Function（Deno 版）
// 这是 NAS 自托管 Supabase 部署指南要求、但之前缺失的核心后端文件。
// 由 supabase/memfire/index.js（Node.js 版）原样移植而来，业务逻辑 100% 一致，
// 仅把运行时不兼容处改成 Deno 写法：
//   - 配置：从 Deno.env.get() 读 Secrets（SB_URL / SB_SERVICE_ROLE_KEY / WECHAT_APPID / WECHAT_SECRET）
//   - 微信 jscode2session：用 fetch 替代 https 模块
//   - 文件上传：用原生 req.formData() 替代 busboy（Deno 内置，无需依赖）
//   - 入口：serve(async (req) => Response) 替代 exports.handler
//
// 调用约定（前端 utils/supabase.js 垫片打过来的 body）：
//   { name: 'login', code }                              -> 微信登录换 openid
//   { name: 'cat-operations'|'feed-operations'|..., action, ... }  -> 各业务
//   { name: 'db', op: 'get'|'list'|'count'|'add'|'update'|'remove', collection, ... } -> 通用库代理
//   multipart/form-data 上传（wx.uploadFile）：file + cloudPath -> 返回 { fileID: 公开 URL }
// 返回统一包成 { result: <payload> }，与云开发返回结构一致。
//
// 部署：supabase/functions/api/index.ts（本文件）
//   方式 A（推荐，免 CLI）：NAS Studio -> Edge Functions -> Create 'api' -> 粘贴本文件 -> Deploy
//                          -> 设置 4 个 Secrets -> 关闭 Verify JWT
//   方式 B（CLI）：supabase functions deploy api --no-verify-jwt（见 README_NAS 步骤三）
// 注意：SB_URL 填容器网络内地址 http://kong:8000（函数跑在 NAS 内网，连 Kong 用内网）
// ============================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

// ===== 配置（从 Edge Function Secrets 读取，不要硬编码到前端） =====
const CONFIG = {
  SUPABASE_URL: Deno.env.get('SB_URL') || '',
  SERVICE_ROLE_KEY: Deno.env.get('SB_SERVICE_ROLE_KEY') || '',
  WECHAT_APPID: Deno.env.get('WECHAT_APPID') || '',
  WECHAT_SECRET: Deno.env.get('WECHAT_SECRET') || '',
};

const supabase = createClient(CONFIG.SUPABASE_URL, CONFIG.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

// ---------- 字段名转换 ----------
function snakeToCamel(s: string): string {
  return s.replace(/_([a-z])/g, (_m, c) => c.toUpperCase());
}
function camelToSnake(s: string): string {
  return s.replace(/[A-Z]/g, (m) => '_' + m.toLowerCase());
}

// 数据库行 -> 前端对象（snake->camel，id->_id，并补回 location 结构供地图使用）
function rowToClient(row: any): any {
  if (row == null) return row;
  const out: any = {};
  for (const k of Object.keys(row)) {
    const key = k === 'id' ? '_id' : snakeToCamel(k);
    out[key] = row[k];
  }
  if (row.latitude != null && row.longitude != null) {
    out.location = {
      type: 'Point',
      coordinates: [row.longitude, row.latitude],
      latitude: row.latitude,
      longitude: row.longitude,
    };
  }
  return out;
}

// 前端对象 -> 数据库行（camel->snake，丢弃 _id）
function clientToRow(obj: any): any {
  if (obj == null) return obj;
  const out: any = {};
  for (const k of Object.keys(obj)) {
    if (k === '_id') continue;
    if (obj[k] === undefined) continue;
    out[camelToSnake(k)] = obj[k];
  }
  return out;
}

// haversine 距离（米）
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ---------- where 条件翻译（云开发常用形态） ----------
function applyWhere(query: any, where: any): any {
  if (!where || typeof where !== 'object') return query;
  for (const [k, v] of Object.entries(where)) {
    const col = camelToSnake(k);
    if (v && typeof v === 'object' && (v as any).__regex) {
      query = query.ilike(col, '%' + (v as any).__regex + '%');
    } else if (v === null) {
      query = query.is(col, null);
    } else {
      query = query.eq(col, v);
    }
  }
  return query;
}

function applyOrder(query: any, orderBy: any): any {
  if (orderBy && orderBy.field) {
    query = query.order(camelToSnake(orderBy.field), {
      ascending: (orderBy.dir || 'desc') === 'asc',
    });
  }
  return query;
}

// ---------- 通知（内部共享函数，替代云函数互调） ----------
async function createNotification(p: any) {
  if (!p.recipientId || p.recipientId === p.senderId) return { success: true, skipped: true };
  const { error } = await supabase.from('notifications').insert({
    recipient_id: p.recipientId,
    sender_id: p.senderId,
    sender_name: p.senderName || '匿名用户',
    sender_avatar: p.senderAvatar || '',
    type: p.type,
    feed_id: p.feedId || null,
    crowd_id: p.crowdId || null,
    feed_content: p.feedContent || '',
    comment_content: p.commentContent || '',
    amount: p.amount || 0,
    is_read: false,
  });
  if (error) console.error('createNotification error', error);
  return { success: true };
}

// ============================================================
// 微信登录（jscode2session）—— Deno 用 fetch
// ============================================================
async function wxCode2Session(code: string): Promise<any> {
  const url =
    `https://api.weixin.qq.com/sns/jscode2session?appid=${CONFIG.WECHAT_APPID}` +
    `&secret=${CONFIG.WECHAT_SECRET}&js_code=${code}&grant_type=authorization_code`;
  const resp = await fetch(url);
  return await resp.json();
}

async function loginAction(event: any) {
  const { code } = event;
  if (!code) return { error: '缺少 code' };
  if (!CONFIG.WECHAT_APPID || !CONFIG.WECHAT_SECRET) return { error: '未配置微信 AppID/Secret' };

  const wxres: any = await wxCode2Session(code);
  if (wxres.errcode) return { error: '微信登录失败: ' + wxres.errmsg };

  const openid = wxres.openid;
  const { data: existing } = await supabase.from('users').select('id').eq('id', openid).maybeSingle();
  let isNew = false;
  if (!existing) {
    await supabase.from('users').insert({ id: openid, nick_name: '', avatar_url: '' });
    isNew = true;
  }
  const { data: user } = await supabase.from('users').select('*').eq('id', openid).single();
  return { openid, userInfo: rowToClient(user), isNew };
}

// ============================================================
// cat-operations
// ============================================================
async function catOps(event: any) {
  const openid = event.openid;
  switch (event.action) {
    case 'create': {
      const catData = event.catData || {};
      const loc = catData.location;
      let lat = null, lng = null;
      if (loc && loc.coordinates && loc.coordinates.length === 2) {
        lng = loc.coordinates[0];
        lat = loc.coordinates[1];
      }
      const row = {
        name: catData.name,
        description: catData.description,
        gender: catData.gender,
        sterilized: catData.sterilized,
        health_status: catData.healthStatus,
        age_at_create: catData.ageAtCreate != null ? catData.ageAtCreate : null,
        photos: catData.photos || [],
        creator_id: openid,
        creator_name: catData.creatorName || '匿名用户',
        last_seen_time: catData.lastSeenTime ? new Date(catData.lastSeenTime).toISOString() : new Date().toISOString(),
        latitude: lat,
        longitude: lng,
        area_radius: catData.areaRadius || 500,
        merge_chain: catData.mergeChain || [],
        aliases: catData.aliases || [],
        status: 'active',
      };
      const { data, error } = await supabase.from('stray_cats').insert(row).select().single();
      if (error) throw error;
      return { success: true, catId: data.id };
    }
    case 'nearby': {
      const { latitude, longitude, page = 1, pageSize = 10 } = event;
      if (!latitude || !longitude) return { success: true, data: [], total: 0 };
      const { data, error } = await supabase
        .from('stray_cats')
        .select('*')
        .eq('status', 'active')
        .not('latitude', 'is', null);
      if (error) throw error;
      const result = (data || [])
        .map((cat) => ({ ...cat, distance: Math.round(haversine(latitude, longitude, cat.latitude, cat.longitude)) }))
        .sort((a, b) => (a.distance || 999999) - (b.distance || 999999));
      const start = (page - 1) * pageSize;
      const pageData = result.slice(start, start + pageSize);
      return { success: true, data: pageData.map(rowToClient), total: result.length };
    }
    case 'detail': {
      const { data, error } = await supabase.from('stray_cats').select('*').eq('id', event.catId).single();
      if (error) throw error;
      return rowToClient(data);
    }
    case 'update': {
      const { catId, updateData } = event;
      const { data: cat, error } = await supabase.from('stray_cats').select('*').eq('id', catId).single();
      if (error) throw error;
      if (cat.creator_id !== openid) return { error: '无权修改' };
      const upd = { ...clientToRow(updateData), update_time: new Date().toISOString() };
      await supabase.from('stray_cats').update(upd).eq('id', catId);
      return { success: true };
    }
    case 'myCats': {
      const { data, error } = await supabase
        .from('stray_cats')
        .select('*')
        .eq('creator_id', openid)
        .eq('status', 'active')
        .order('create_time', { ascending: false })
        .limit(50);
      if (error) throw error;
      return { success: true, data: (data || []).map(rowToClient) };
    }
    default:
      return { error: '未知操作' };
  }
}

// ============================================================
// feed-operations
// ============================================================
async function feedOps(event: any) {
  const openid = event.openid;
  switch (event.action) {
    case 'create': {
      const { content, photos, catId } = event;
      let userInfo = { nickName: '匿名用户', avatarUrl: '' };
      const { data: u } = await supabase.from('users').select('*').eq('id', openid).single();
      if (u) userInfo = { nickName: u.nick_name || '匿名用户', avatarUrl: u.avatar_url || '' };
      let catInfo = null;
      if (catId) {
        const { data: cat } = await supabase.from('stray_cats').select('*').eq('id', catId).single();
        if (cat) catInfo = { _id: cat.id, name: cat.name, breed: cat.breed, photos: cat.photos || [] };
      }
      const feed = {
        content,
        photos: photos || [],
        author_id: openid,
        author_name: userInfo.nickName,
        author_avatar: userInfo.avatarUrl,
        cat_id: catId || null,
        cat_info: catInfo,
        like_count: 0,
        comment_count: 0,
      };
      const { data, error } = await supabase.from('feeds').insert(feed).select().single();
      if (error) throw error;
      return { success: true, feedId: data.id };
    }
    case 'list': {
      const { page = 0, pageSize = 10 } = event;
      const { data, error } = await supabase
        .from('feeds')
        .select('*')
        .order('create_time', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      const feedIds = (data || []).map((f) => f.id);
      let liked: any[] = [];
      if (feedIds.length) {
        const { data: likes } = await supabase
          .from('feed_likes')
          .select('feed_id')
          .in('feed_id', feedIds)
          .eq('user_id', openid);
        liked = (likes || []).map((l) => l.feed_id);
      }
      const feeds = (data || []).map((f) => ({
        ...rowToClient(f),
        isLiked: liked.includes(f.id),
        userName: f.author_name,
        userAvatar: f.author_avatar,
      }));
      return { success: true, data: feeds };
    }
    case 'myFeeds': {
      const { page = 0, pageSize = 10 } = event;
      const { data, error } = await supabase
        .from('feeds')
        .select('*')
        .eq('author_id', openid)
        .order('create_time', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      const feedIds = (data || []).map((f) => f.id);
      const likeCountMap: any = {};
      if (feedIds.length) {
        const { data: likes } = await supabase.from('feed_likes').select('feed_id').in('feed_id', feedIds);
        (likes || []).forEach((l) => (likeCountMap[l.feed_id] = (likeCountMap[l.feed_id] || 0) + 1));
      }
      const feeds = (data || []).map((f) => ({
        ...rowToClient(f),
        likeCount: likeCountMap[f.id] || 0,
      }));
      return { success: true, data: feeds };
    }
    case 'update': {
      const { feedId, content, photos, catId } = event;
      const { data: feed, error } = await supabase.from('feeds').select('*').eq('id', feedId).single();
      if (error) throw error;
      if (feed.author_id !== openid) return { error: '无权编辑' };
      let catInfo = null;
      if (catId) {
        const { data: cat } = await supabase.from('stray_cats').select('*').eq('id', catId).single();
        if (cat) catInfo = { _id: cat.id, name: cat.name, breed: cat.breed, photos: cat.photos || [] };
      }
      await supabase
        .from('feeds')
        .update({ content, photos: photos || [], cat_id: catId || null, cat_info: catInfo, update_time: new Date().toISOString() })
        .eq('id', feedId);
      return { success: true };
    }
    case 'like': {
      const { feedId } = event;
      const { data: existing } = await supabase
        .from('feed_likes')
        .select('id')
        .eq('feed_id', feedId)
        .eq('user_id', openid)
        .maybeSingle();
      if (existing) return { success: true, message: '已点赞' };
      await supabase.from('feed_likes').insert({ feed_id: feedId, user_id: openid });
      const { data: f } = await supabase.from('feeds').select('like_count').eq('id', feedId).single();
      await supabase.from('feeds').update({ like_count: (f ? f.like_count || 0 : 0) + 1 }).eq('id', feedId);
      const { data: feed } = await supabase.from('feeds').select('*').eq('id', feedId).single();
      if (feed && feed.author_id && feed.author_id !== openid) {
        const { data: sender } = await supabase.from('users').select('*').eq('id', openid).single();
        await createNotification({
          recipientId: feed.author_id,
          senderId: openid,
          senderName: sender ? sender.nick_name || '匿名用户' : '匿名用户',
          senderAvatar: sender ? sender.avatar_url || '' : '',
          type: 'like',
          feedId,
          feedContent: (feed.content || '').slice(0, 50),
        });
      }
      return { success: true };
    }
    case 'unlike': {
      const { feedId } = event;
      const { data: like } = await supabase
        .from('feed_likes')
        .select('id')
        .eq('feed_id', feedId)
        .eq('user_id', openid)
        .maybeSingle();
      if (like) await supabase.from('feed_likes').delete().eq('id', like.id);
      const { data: f } = await supabase.from('feeds').select('like_count').eq('id', feedId).single();
      await supabase.from('feeds').update({ like_count: Math.max(0, (f ? f.like_count || 1 : 1) - 1) }).eq('id', feedId);
      return { success: true };
    }
    case 'delete': {
      const { feedId } = event;
      const { data: feed, error } = await supabase.from('feeds').select('*').eq('id', feedId).single();
      if (error) throw error;
      if (feed.author_id !== openid) return { error: '无权删除' };
      await supabase.from('feeds').delete().eq('id', feedId);
      return { success: true };
    }
    case 'getDetail': {
      const { feedId } = event;
      const { data: feed, error } = await supabase.from('feeds').select('*').eq('id', feedId).single();
      if (error) throw error;
      const { data: like } = await supabase
        .from('feed_likes')
        .select('id')
        .eq('feed_id', feedId)
        .eq('user_id', openid)
        .maybeSingle();
      return {
        success: true,
        data: { ...rowToClient(feed), isLiked: !!like, userName: feed.author_name, userAvatar: feed.author_avatar },
      };
    }
    case 'addComment': {
      const { feedId, content, parentId } = event;
      if (!content || !content.trim()) return { error: '评论内容不能为空' };
      const { data: u } = await supabase.from('users').select('*').eq('id', openid).single();
      const userInfo = { nickName: u ? u.nick_name || '匿名用户' : '匿名用户', avatarUrl: u ? u.avatar_url || '' : '' };
      const { data, error } = await supabase
        .from('feed_comments')
        .insert({
          feed_id: feedId,
          content: content.trim(),
          author_id: openid,
          author_name: userInfo.nickName,
          author_avatar: userInfo.avatarUrl,
          parent_id: parentId || null,
          like_count: 0,
        })
        .select()
        .single();
      if (error) throw error;
      const { data: f } = await supabase.from('feeds').select('comment_count').eq('id', feedId).single();
      await supabase.from('feeds').update({ comment_count: (f ? f.comment_count || 0 : 0) + 1 }).eq('id', feedId);
      const { data: feed } = await supabase.from('feeds').select('*').eq('id', feedId).single();
      if (feed && feed.author_id && feed.author_id !== openid) {
        await createNotification({
          recipientId: feed.author_id,
          senderId: openid,
          senderName: userInfo.nickName,
          senderAvatar: userInfo.avatarUrl,
          type: 'comment',
          feedId,
          feedContent: (feed.content || '').slice(0, 50),
          commentContent: content.trim().slice(0, 100),
        });
      }
      return { success: true, data: rowToClient(data) };
    }
    case 'listComments': {
      const { feedId, page = 0, pageSize = 20 } = event;
      const { data, error } = await supabase
        .from('feed_comments')
        .select('*')
        .eq('feed_id', feedId)
        .is('parent_id', null)
        .order('create_time', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      const comments = await Promise.all(
        (data || []).map(async (c) => {
          let replies: any[] = [];
          let replyCount = 0;
          const { data: r } = await supabase
            .from('feed_comments')
            .select('*')
            .eq('parent_id', c.id)
            .order('create_time', { ascending: true })
            .limit(2);
          replies = r || [];
          const { count } = await supabase.from('feed_comments').select('*', { count: 'exact' }).eq('parent_id', c.id);
          replyCount = count || 0;
          return { ...rowToClient(c), replyCount, replies: replies.map(rowToClient), isAuthor: c.author_id === openid };
        })
      );
      return { success: true, data: comments };
    }
    case 'deleteComment': {
      const { commentId } = event;
      const { data: comment, error } = await supabase.from('feed_comments').select('*').eq('id', commentId).single();
      if (error) throw error;
      if (comment.author_id !== openid) return { error: '无权删除' };
      await supabase.from('feed_comments').delete().eq('id', commentId);
      if (!comment.parent_id) {
        const { data: replies } = await supabase.from('feed_comments').select('id').eq('parent_id', commentId);
        for (const r of replies || []) await supabase.from('feed_comments').delete().eq('id', r.id);
        const { data: f } = await supabase.from('feeds').select('comment_count').eq('id', comment.feed_id).single();
        await supabase
          .from('feeds')
          .update({ comment_count: Math.max(0, (f ? f.comment_count || 1 : 1) - 1 - (replies ? replies.length : 0)) })
          .eq('id', comment.feed_id);
      } else {
        const { data: f } = await supabase.from('feeds').select('comment_count').eq('id', comment.feed_id).single();
        await supabase.from('feeds').update({ comment_count: Math.max(0, (f ? f.comment_count || 1 : 1) - 1) }).eq('id', comment.feed_id);
      }
      return { success: true };
    }
    default:
      return { error: '未知操作' };
  }
}

// ============================================================
// crowd-operations
// ============================================================
async function crowdOps(event: any) {
  const openid = event.openid;
  switch (event.action) {
    case 'create': {
      const cd = event.crowdData || {};
      const row = {
        ...clientToRow(cd),
        initiator_id: openid,
        status: 'ongoing',
        receipt_status: 'none',
        receipt_records: [],
        raised_amount: 0,
      };
      const { data, error } = await supabase.from('crowdfundings').insert(row).select().single();
      if (error) throw error;
      return { success: true, crowdId: data.id };
    }
    case 'list': {
      const { status, page = 0, pageSize = 10 } = event;
      let query = supabase.from('crowdfundings').select('*', { count: 'exact' });
      if (status) query = query.eq('status', status);
      query = query.order('create_time', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1);
      const { data, error, count } = await query;
      if (error) throw error;
      return { data: (data || []).map(rowToClient), total: count || 0 };
    }
    case 'apply_receipt': {
      const { crowdId, amount, remark, receipts } = event;
      const { data: crowd, error } = await supabase.from('crowdfundings').select('*').eq('id', crowdId).single();
      if (error) throw error;
      if (crowd.initiator_id !== openid) return { error: '仅发起人可申请报销' };
      const record = {
        _id: crowdId + '_' + Date.now(),
        status: 'pending',
        amount: amount || 0,
        remark: remark || '',
        receipts: receipts || [],
        create_time: new Date().toISOString(),
      };
      const records = [...(crowd.receipt_records || []), record];
      await supabase
        .from('crowdfundings')
        .update({ receipt_status: 'pending', receipt_records: records, update_time: new Date().toISOString() })
        .eq('id', crowdId);
      return { success: true };
    }
    case 'approve_receipt': {
      const { crowdId, approved } = event;
      await supabase
        .from('crowdfundings')
        .update({ receipt_status: approved ? 'approved' : 'rejected', update_time: new Date().toISOString() })
        .eq('id', crowdId);
      return { success: true };
    }
    case 'complete_crowd': {
      const { crowdId } = event;
      await supabase.from('crowdfundings').update({ status: 'completed', update_time: new Date().toISOString() }).eq('id', crowdId);
      return { success: true };
    }
    default:
      return { error: '未知操作' };
  }
}

// ============================================================
// payment-operations
// ============================================================
async function paymentOps(event: any) {
  const openid = event.openid;
  switch (event.action) {
    case 'demo_donate': {
      const { crowdId, amount, donorName } = event;
      if (!crowdId || !amount || amount <= 0) return { error: '参数错误' };
      await supabase.from('donations').insert({
        crowd_id: crowdId,
        donor_id: openid,
        donor_name: donorName || '匿名爱心人士',
        amount,
        payment_method: 'demo',
        payment_status: 'paid',
      });
      const { data: c } = await supabase.from('crowdfundings').select('raised_amount').eq('id', crowdId).single();
      await supabase
        .from('crowdfundings')
        .update({ raised_amount: (c ? c.raised_amount || 0 : 0) + amount, update_time: new Date().toISOString() })
        .eq('id', crowdId);
      const { data: crowd } = await supabase.from('crowdfundings').select('*').eq('id', crowdId).single();
      if (crowd && crowd.initiator_id && crowd.initiator_id !== openid) {
        await createNotification({
          recipientId: crowd.initiator_id,
          senderId: openid,
          senderName: donorName || '匿名爱心人士',
          senderAvatar: '',
          type: 'donate',
          crowdId,
          feedContent: (crowd.description || '').slice(0, 50),
          amount,
        });
      }
      return { success: true };
    }
    case 'create_order':
      return { error: '微信支付尚未接入，请使用 demo_donate 模式' };
    case 'pay_callback':
      return { success: true };
    default:
      return { error: '未知操作' };
  }
}

// ============================================================
// notify-operations
// ============================================================
async function notifyOps(event: any) {
  const openid = event.openid;
  switch (event.action) {
    case 'create':
      return await createNotification(event);
    case 'list': {
      const { type, page = 0, pageSize = 20 } = event;
      let query = supabase.from('notifications').select('*').eq('recipient_id', openid);
      if (type) query = query.eq('type', type);
      const { data, error } = await query
        .order('create_time', { ascending: false })
        .range(page * pageSize, page * pageSize + pageSize - 1);
      if (error) throw error;
      return { success: true, data: (data || []).map(rowToClient) };
    }
    case 'unreadCount': {
      const [likeRes, commentRes, donateRes] = await Promise.all([
        supabase.from('notifications').select('*', { count: 'exact' }).eq('recipient_id', openid).eq('type', 'like').eq('is_read', false),
        supabase.from('notifications').select('*', { count: 'exact' }).eq('recipient_id', openid).eq('type', 'comment').eq('is_read', false),
        supabase.from('notifications').select('*', { count: 'exact' }).eq('recipient_id', openid).eq('type', 'donate').eq('is_read', false),
      ]);
      const likeCount = likeRes.count || 0;
      const commentCount = commentRes.count || 0;
      const donateCount = donateRes.count || 0;
      return { success: true, total: likeCount + commentCount + donateCount, likeCount, commentCount, donateCount };
    }
    case 'markRead': {
      const { ids } = event;
      if (!ids || !ids.length) return { success: true };
      await supabase.from('notifications').update({ is_read: true }).in('id', ids).eq('recipient_id', openid);
      return { success: true };
    }
    case 'markAllRead': {
      const { type } = event;
      let query = supabase.from('notifications').update({ is_read: true }).eq('recipient_id', openid).eq('is_read', false);
      if (type) query = query.eq('type', type);
      await query;
      return { success: true };
    }
    default:
      return { error: '未知操作' };
  }
}

// ============================================================
// merge-operations
// ============================================================
async function mergeOps(event: any) {
  const openid = event.openid;
  switch (event.action) {
    case 'create': {
      const { fromCatId, toCatId, note } = event;
      const [fromCat, toCat] = await Promise.all([
        supabase.from('stray_cats').select('*').eq('id', fromCatId).single(),
        supabase.from('stray_cats').select('*').eq('id', toCatId).single(),
      ]);
      const { data, error } = await supabase
        .from('merge_requests')
        .insert({
          from_cat_id: fromCatId,
          from_cat_name: fromCat.data ? fromCat.data.name : null,
          from_user_id: fromCat.data ? fromCat.data.creator_id : null,
          to_cat_id: toCatId,
          to_cat_name: toCat.data ? toCat.data.name : null,
          to_user_id: toCat.data ? toCat.data.creator_id : null,
          applicant_id: openid,
          status: 'pending',
          note: note || '疑似同一只猫',
        })
        .select()
        .single();
      if (error) throw error;
      return { success: true, requestId: data.id };
    }
    case 'approve': {
      const { requestId } = event;
      const { data: req } = await supabase.from('merge_requests').select('*').eq('id', requestId).single();
      if (!req || req.status !== 'pending') return { error: '该申请已处理' };
      const [fromCat, toCat] = await Promise.all([
        supabase.from('stray_cats').select('*').eq('id', req.from_cat_id).single(),
        supabase.from('stray_cats').select('*').eq('id', req.to_cat_id).single(),
      ]);
      const fromTime = new Date(fromCat.data.last_seen_time || 0).getTime();
      const toTime = new Date(toCat.data.last_seen_time || 0).getTime();
      const mainCat = fromTime <= toTime ? fromCat.data : toCat.data;
      const subCat = fromTime <= toTime ? toCat.data : fromCat.data;
      const aliases = [...(mainCat.aliases || [])];
      if (!aliases.includes(subCat.name)) aliases.push(subCat.name);
      const allPhotos = [...(mainCat.photos || []), ...(subCat.photos || [])];
      const mergeChain = [
        ...(mainCat.merge_chain || []),
        {
          merge_id: requestId,
          cat_id: subCat.id,
          cat_name: subCat.name,
          merged_by_id: openid,
          merged_by_name: '管理员',
          merged_time: new Date().toLocaleString('zh-CN'),
        },
      ];
      await supabase
        .from('stray_cats')
        .update({ aliases, photos: allPhotos, merge_chain: mergeChain, update_time: new Date().toISOString() })
        .eq('id', mainCat.id);
      await supabase
        .from('stray_cats')
        .update({ status: 'merged', merged_into: mainCat.id, update_time: new Date().toISOString() })
        .eq('id', subCat.id);
      await supabase
        .from('merge_requests')
        .update({ status: 'approved', approved_by_id: openid, approved_time: new Date().toISOString() })
        .eq('id', requestId);
      return { success: true, mainCatId: mainCat.id };
    }
    case 'reject': {
      const { requestId, reason } = event;
      await supabase
        .from('merge_requests')
        .update({ status: 'rejected', rejected_by_id: openid, reject_reason: reason || '', update_time: new Date().toISOString() })
        .eq('id', requestId);
      return { success: true };
    }
    case 'list': {
      const { status, userId } = event;
      let query = supabase.from('merge_requests').select('*');
      if (status) query = query.eq('status', status);
      if (userId) query = query.or(`from_user_id.eq.${userId},to_user_id.eq.${userId}`);
      const { data, error } = await query.order('create_time', { ascending: false }).limit(50);
      if (error) throw error;
      return data || [];
    }
    default:
      return { error: '未知操作' };
  }
}

// ============================================================
// 通用数据库代理（对应前端 utils/database.js 及直接 db 调用）
// ============================================================
async function dbProxy(event: any) {
  const { op, collection, id, where, orderBy, skip, limit, data } = event;
  switch (op) {
    case 'get': {
      const { data: row, error } = await supabase.from(collection).select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      return { data: row ? rowToClient(row) : null };
    }
    case 'list': {
      let query = supabase.from(collection).select('*');
      query = applyWhere(query, where);
      query = applyOrder(query, orderBy);
      const from = skip != null ? skip : 0;
      const to = from + (limit != null ? limit : 100) - 1;
      query = query.range(from, to);
      const { data: rows, error } = await query;
      if (error) throw error;
      return { data: (rows || []).map(rowToClient) };
    }
    case 'count': {
      let query = supabase.from(collection).select('*', { count: 'exact', head: true });
      query = applyWhere(query, where);
      const { count, error } = await query;
      if (error) throw error;
      return { total: count || 0 };
    }
    case 'add': {
      const row = clientToRow(data);
      row.create_time = new Date().toISOString();
      row.update_time = new Date().toISOString();
      const { data: inserted, error } = await supabase.from(collection).insert(row).select().single();
      if (error) throw error;
      return { _id: inserted.id };
    }
    case 'update': {
      const row = { ...clientToRow(data), update_time: new Date().toISOString() };
      const { error } = await supabase.from(collection).update(row).eq('id', id);
      if (error) throw error;
      return { success: true };
    }
    case 'remove': {
      const { error } = await supabase.from(collection).delete().eq('id', id);
      if (error) throw error;
      return { success: true };
    }
    default:
      return { error: '未知 db 操作' };
  }
}

// ============================================================
// 路由
// ============================================================
async function route(body: any) {
  const { name } = body;
  switch (name) {
    case 'login':
      return await loginAction(body);
    case 'cat-operations':
      return await catOps(body);
    case 'feed-operations':
      return await feedOps(body);
    case 'crowd-operations':
      return await crowdOps(body);
    case 'payment-operations':
      return await paymentOps(body);
    case 'notify-operations':
      return await notifyOps(body);
    case 'merge-operations':
      return await mergeOps(body);
    case 'db':
      return await dbProxy(body);
    default:
      return { error: '未知服务: ' + name };
  }
}

// ---------- 文件上传代理（前端 wx.uploadFile 发 multipart 到此处） ----------
async function uploadAction(cloudPathRaw: string, fileBuffer: Uint8Array, fileType: string) {
  if (!fileBuffer) return { error: 'missing file' };
  if (!cloudPathRaw) return { error: 'missing cloudPath' };

  let cloudPath = cloudPathRaw
    .trim()
    .replace(/^["']|["']$/g, '')
    .replace(/^\/+/, '')
    .replace(/\\/g, '/');
  if (!cloudPath) return { error: 'cloudPath is empty after trim (raw=' + JSON.stringify(cloudPathRaw) + ')' };

  const { data, error } = await supabase.storage
    .from('cat-images')
    .upload(cloudPath, fileBuffer, {
      contentType: fileType || 'application/octet-stream',
      upsert: true,
    });

  if (error) {
    console.error('storage upload error', { cloudPath, type: fileType, size: fileBuffer.byteLength, error });
    return { error: `[${cloudPath}] ${error.message}` };
  }

  const { data: urlData } = supabase.storage.from('cat-images').getPublicUrl(cloudPath);
  return { fileID: urlData.publicUrl };
}

// ---------- 云函数入口（Supabase Edge Function / Deno） ----------
serve(async (req: Request) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, apikey, Content-Type',
    'Access-Control-Max-Age': '3600',
  };

  if (req.method === 'OPTIONS') {
    return new Response('', { status: 204, headers: corsHeaders });
  }

  try {
    const contentType = (req.headers.get('content-type') || '').toLowerCase();
    let result: any;
    if (contentType.includes('multipart/form-data')) {
      const form = await req.formData();
      const file = form.get('file');
      const cloudPath = String(form.get('cloudPath') || '');
      if (file && typeof file !== 'string') {
        const f = file as File;
        const buf = new Uint8Array(await f.arrayBuffer());
        result = await uploadAction(cloudPath, buf, f.type || 'application/octet-stream');
      } else {
        result = { error: 'missing file' };
      }
    } else {
      const body = await req.json();
      result = await route(body);
    }
    return new Response(JSON.stringify({ result }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('Function error', err);
    return new Response(
      JSON.stringify({ result: { error: (err as Error).message || '服务器错误' } }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
