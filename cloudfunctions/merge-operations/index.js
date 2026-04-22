/**
 * 流浪猫档案合并操作云函数
 * actions: create, approve, reject, list
 * 
 * 合并逻辑：
 * 1. 用户发起合并申请
 * 2. 对方用户和管理员可审核
 * 3. 审核通过后：
 *    - 保留创建时间较早的档案为主档
 *    - 较晚的档案名字变为主档的别名
 *    - 双方照片合并到主档
 *    - 记录合并链
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
      return await createMergeRequest(event, OPENID);
    case 'approve':
      return await approveMerge(event, OPENID);
    case 'reject':
      return await rejectMerge(event, OPENID);
    case 'list':
      return await listMergeRequests(event);
    default:
      return { error: '未知操作' };
  }
};

/**
 * 创建合并申请
 */
async function createMergeRequest(event, openid) {
  const { fromCatId, toCatId } = event;

  // 获取两只猫的信息
  const [fromCat, toCat] = await Promise.all([
    db.collection('stray_cats').doc(fromCatId).get(),
    db.collection('stray_cats').doc(toCatId).get(),
  ]);

  const record = {
    fromCatId,
    fromCatName: fromCat.data.name,
    fromUserId: fromCat.data.creatorId,
    toCatId,
    toCatName: toCat.data.name,
    toUserId: toCat.data.creatorId,
    applicantId: openid,
    status: 'pending',
    note: event.note || '疑似同一只猫',
    createTime: db.serverDate(),
  };

  const { _id } = await db.collection('merge_requests').add({ data: record });
  return { success: true, requestId: _id };
}

/**
 * 审批通过合并
 */
async function approveMerge(event, openid) {
  const { requestId } = event;
  const request = await db.collection('merge_requests').doc(requestId).get();
  const req = request.data;

  if (req.status !== 'pending') {
    return { error: '该申请已处理' };
  }

  // 获取两只猫的数据
  const [fromCat, toCat] = await Promise.all([
    db.collection('stray_cats').doc(req.fromCatId).get(),
    db.collection('stray_cats').doc(req.toCatId).get(),
  ]);

  // 确定主档和副档（创建时间早的为主档）
  let mainCat, subCat;
  const fromTime = new Date(fromCat.data.createTime).getTime();
  const toTime = new Date(toCat.data.createTime).getTime();

  if (fromTime <= toTime) {
    mainCat = { ...fromCat.data, id: req.fromCatId };
    subCat = { ...toCat.data, id: req.toCatId };
  } else {
    mainCat = { ...toCat.data, id: req.toCatId };
    subCat = { ...fromCat.data, id: req.fromCatId };
  }

  // 合并数据
  const aliases = [...(mainCat.aliases || [])];
  if (!aliases.includes(subCat.name)) {
    aliases.push(subCat.name);
  }

  const allPhotos = [
    ...(mainCat.photos || []),
    ...(subCat.photos || []),
  ];

  const mergeChain = [
    ...(mainCat.mergeChain || []),
    {
      mergeId: requestId,
      catId: subCat.id,
      catName: subCat.name,
      mergedById: openid,
      mergedByName: '管理员',
      mergedTime: new Date().toLocaleString('zh-CN'),
    },
  ];

  // 更新主档
  await db.collection('stray_cats').doc(mainCat.id).update({
    data: {
      aliases,
      photos: allPhotos,
      mergeChain,
      updateTime: db.serverDate(),
    },
  });

  // 标记副档为已合并
  await db.collection('stray_cats').doc(subCat.id).update({
    data: {
      status: 'merged',
      mergedInto: mainCat.id,
      updateTime: db.serverDate(),
    },
  });

  // 更新申请状态
  await db.collection('merge_requests').doc(requestId).update({
    data: {
      status: 'approved',
      approvedById: openid,
      approvedTime: db.serverDate(),
    },
  });

  return { success: true, mainCatId: mainCat.id };
}

/**
 * 拒绝合并
 */
async function rejectMerge(event, openid) {
  const { requestId, reason } = event;

  await db.collection('merge_requests').doc(requestId).update({
    data: {
      status: 'rejected',
      rejectedById: openid,
      rejectReason: reason || '',
      updateTime: db.serverDate(),
    },
  });

  return { success: true };
}

/**
 * 获取合并申请列表
 */
async function listMergeRequests(event) {
  const { status, userId } = event;
  let condition = {};

  if (status) condition.status = status;
  if (userId) {
    condition = _.or([
      { fromUserId: userId },
      { toUserId: userId },
    ]);
  }

  const { data } = await db.collection('merge_requests')
    .where(condition)
    .orderBy('createTime', 'desc')
    .limit(50)
    .get();

  return data;
}
