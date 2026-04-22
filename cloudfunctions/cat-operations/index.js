/**
 * 流浪猫档案操作云函数
 * actions: create, nearby, detail, update
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  switch (action) {
    case 'create':
      return await createCat(event, OPENID);
    case 'nearby':
      return await getNearbyCats(event);
    case 'detail':
      return await getCatDetail(event);
    case 'update':
      return await updateCat(event, OPENID);
    case 'myCats':
      return await getMyCats(OPENID);
    default:
      return { error: '未知操作' };
  }
};

/**
 * 创建流浪猫档案
 */
async function createCat(event, openid) {
  const { catData } = event;

  // 补充创建者信息
  const record = {
    ...catData,
    creatorId: openid,
    creatorName: catData.creatorName || '匿名用户',
    lastSeenTime: catData.lastSeenTime || new Date(),
    mergeChain: [],
    aliases: [],
    status: 'active',
    createTime: db.serverDate(),
    updateTime: db.serverDate(),
  };

  // 如果 location 是客户端传来的 GeoJSON 对象，需要在云函数端重新构造
  // 客户端 db.Geo.Point 传到云函数后会被序列化为 {type: 'Point', coordinates: [lng, lat]}
  if (catData.location && catData.location.type === 'Point' && Array.isArray(catData.location.coordinates)) {
    const [lng, lat] = catData.location.coordinates;
    record.location = db.Geo.Point(lng, lat);
  }

  const { _id } = await db.collection('stray_cats').add({ data: record });
  return { success: true, catId: _id };
}

/**
 * 获取附近流浪猫
 * 使用地理位置查询，需要先在云数据库创建索引
 */
async function getNearbyCats(event) {
  const { latitude, longitude, page = 1, pageSize = 10 } = event;

  if (!latitude || !longitude) {
    return { success: true, data: [], total: 0 };
  }

  try {
    const { data } = await db.collection('stray_cats')
      .where({ status: 'active' })
      .orderBy('createTime', 'desc')
      .skip((page - 1) * pageSize)
      .limit(pageSize)
      .get();

    let result = data || [];
    if (data && data.length > 0) {
      result = data.map(cat => {
        let catLng, catLat;
        if (cat.location && cat.location.coordinates) {
          [catLng, catLat] = cat.location.coordinates;
        } else if (Array.isArray(cat.location) && cat.location.length >= 2) {
          [catLng, catLat] = cat.location;
        }
        if (catLng !== undefined && catLat !== undefined) {
          const distance = calculateDistance(latitude, longitude, catLat, catLng);
          return { ...cat, distance: Math.round(distance) };
        }
        return cat;
      }).sort((a, b) => (a.distance || 999999) - (b.distance || 999999));
    }

    return { success: true, data: result, total: result.length };
  } catch (err) {
    console.error('查询失败:', err.message);
    return { success: true, data: [], total: 0 };
  }
}

/**
 * 计算两点间距离（米）
 */
function calculateDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000; // 地球半径
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLng/2) * Math.sin(dLng/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

/**
 * 获取猫咪详情
 */
async function getCatDetail(event) {
  const { catId } = event;
  const { data } = await db.collection('stray_cats').doc(catId).get();
  return data;
}

/**
 * 更新流浪猫信息
 */
async function updateCat(event, openid) {
  const { catId, updateData } = event;

  // 验证是创建者本人
  const cat = await db.collection('stray_cats').doc(catId).get();
  if (cat.data.creatorId !== openid) {
    return { error: '无权修改' };
  }

  await db.collection('stray_cats').doc(catId).update({
    data: {
      ...updateData,
      updateTime: db.serverDate(),
    },
  });

  return { success: true };
}

/**
 * 获取我创建的猫咪
 */
async function getMyCats(openid) {
  try {
    const { data } = await db.collection('stray_cats')
      .where({
        creatorId: openid,
        status: 'active'
      })
      .orderBy('createTime', 'desc')
      .limit(50)
      .get();

    return { success: true, data };
  } catch (err) {
    console.error('获取我的猫咪失败:', err);
    return { error: err.message };
  }
}
