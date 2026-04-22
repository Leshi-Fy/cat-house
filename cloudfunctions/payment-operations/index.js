/**
 * 支付操作云函数
 * actions: demo_donate, create_order (微信支付), pay_callback
 * 
 * 当前 demo_donate 为演示模式，直接记录捐款。
 * 接入微信支付后使用 create_order 和 pay_callback。
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();
  const { action } = event;

  switch (action) {
    case 'demo_donate':
      return await demoDonate(event, OPENID);
    case 'create_order':
      return await createPaymentOrder(event, OPENID);
    case 'pay_callback':
      return await handlePayCallback(event, OPENID);
    default:
      return { error: '未知操作' };
  }
};

/**
 * 演示模式捐款 - 直接记录，不走支付
 */
async function demoDonate(event, openid) {
  const { crowdId, amount, donorName } = event;

  if (!crowdId || !amount || amount <= 0) {
    return { error: '参数错误' };
  }

  // 记录捐款
  await db.collection('donations').add({
    data: {
      crowdId,
      donorId: openid,
      donorName: donorName || '匿名爱心人士',
      amount,
      paymentMethod: 'demo',
      createTime: db.serverDate(),
    },
  });

  // 更新众筹已筹金额
  await db.collection('crowdfundings').doc(crowdId).update({
    data: {
      raisedAmount: _.inc(amount),
      updateTime: db.serverDate(),
    },
  });

  return { success: true };
}

/**
 * 创建微信支付订单（预留）
 * 
 * 接入步骤：
 * 1. 在微信商户平台开通微信支付
 * 2. 在云开发控制台绑定微信支付
 * 3. 取消下方注释并补充商户配置
 * 
 * async function createPaymentOrder(event, openid) {
 *   const { crowdId, amount, donorName } = event;
 * 
 *   // 调用云开发微信支付
 *   const res = await cloud.cloudPay.unifiedOrder({
 *     body: `猫屋众筹-${crowdId}`,
 *     outTradeNo: `CAT_${Date.now()}_${openid.substr(0, 8)}`,
 *     spbillCreateIp: '127.0.0.1',
 *     totalFee: amount,
 *     envId: cloud.DYNAMIC_CURRENT_ENV,
 *     functionName: 'payment-operations',
 *     nonceStr: Math.random().toString(36).substr(2, 15),
 *     tradeType: 'JSAPI',
 *   });
 * 
 *   // 记录待支付订单
 *   await db.collection('donations').add({
 *     data: {
 *       crowdId,
 *       donorId: openid,
 *       donorName,
 *       amount,
 *       paymentMethod: 'wechat',
 *       paymentStatus: 'pending',
 *       outTradeNo: res.payment.outTradeNo,
 *       createTime: db.serverDate(),
 *     },
 *   });
 * 
 *   return res.payment;
 * }
 */

/**
 * 支付回调（预留）
 */
async function handlePayCallback(event, openid) {
  // 微信支付成功后自动触发
  // 更新捐款状态和众筹金额
  const { outTradeNo } = event;

  const { data: donations } = await db.collection('donations')
    .where({ outTradeNo, paymentStatus: 'pending' })
    .get();

  if (donations.length > 0) {
    const donation = donations[0];
    
    await db.collection('donations').doc(donation._id).update({
      data: {
        paymentStatus: 'paid',
        payTime: db.serverDate(),
      },
    });

    await db.collection('crowdfundings').doc(donation.crowdId).update({
      data: {
        raisedAmount: _.inc(donation.amount),
        updateTime: db.serverDate(),
      },
    });
  }

  return { success: true };
}

// 占位导出（防止注释掉的函数导致报错）
function createPaymentOrder() {
  return { error: '微信支付尚未接入，请使用 demo_donate 模式' };
}
