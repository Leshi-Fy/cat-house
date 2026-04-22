/**
 * 众筹操作云函数
 * actions: create, list, apply_receipt, approve_receipt, complete_crowd
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
      return await createCrowdfund(event, OPENID);
    case 'list':
      return await listCrowdfunds(event);
    case 'apply_receipt':
      return await applyReceipt(event, OPENID);
    case 'approve_receipt':
      return await approveReceipt(event, OPENID);
    case 'complete_crowd':
      return await completeCrowdfund(event, OPENID);
    default:
      return { error: '未知操作' };
  }
};

/**
 * 获取众筹列表（社区页展示用）
 */
async function listCrowdfunds(event) {
  const { status, page = 0, pageSize = 10 } = event;

  const where = {};
  if (status) where.status = status;

  const { data } = await db.collection('crowdfundings')
    .where(where)
    .orderBy('createTime', 'desc')
    .skip(page * pageSize)
    .limit(pageSize)
    .get();

  // 统计总条数
  const { total } = await db.collection('crowdfundings').where(where).count();

  return { data, total };
}

/**
 * 创建众筹
 */
async function createCrowdfund(event, openid) {
  const { crowdData } = event;

  const record = {
    ...crowdData,
    initiatorId: openid,
    status: 'ongoing',
    receiptStatus: 'none',  // none | pending | approved | rejected
    receipts: [],
    createTime: db.serverDate(),
    updateTime: db.serverDate(),
  };

  const { _id } = await db.collection('crowdfundings').add({ data: record });
  return { success: true, crowdId: _id };
}

/**
 * 申请报销（追加到 receiptRecords 数组，支持多次报销）
 */
async function applyReceipt(event, openid) {
  const { crowdId, amount, remark, receipts } = event;

  // 验证是发起人
  const crowd = await db.collection('crowdfundings').doc(crowdId).get();
  if (crowd.data.initiatorId !== openid) {
    return { error: '仅发起人可申请报销' };
  }

  const record = {
    _id: crowdId + '_' + Date.now(),
    status: 'pending',
    amount: amount || 0,
    remark: remark || '',
    receipts: receipts || [],
    createTime: db.serverDate(),
  };

  await db.collection('crowdfundings').doc(crowdId).update({
    data: {
      receiptStatus: 'pending',
      receiptRecords: _.push(record),
      updateTime: db.serverDate(),
    },
  });

  return { success: true };
}

/**
 * 管理员审核报销（需配合管理员权限系统）
 */
async function approveReceipt(event, openid) {
  const { crowdId, approved } = event;

  // TODO: 添加管理员权限验证
  await db.collection('crowdfundings').doc(crowdId).update({
    data: {
      receiptStatus: approved ? 'approved' : 'rejected',
      updateTime: db.serverDate(),
    },
  });

  return { success: true };
}

/**
 * 完成众筹
 */
async function completeCrowdfund(event, openid) {
  const { crowdId } = event;

  await db.collection('crowdfundings').doc(crowdId).update({
    data: {
      status: 'completed',
      updateTime: db.serverDate(),
    },
  });

  return { success: true };
}
