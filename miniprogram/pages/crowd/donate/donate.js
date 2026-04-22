/**
 * 捐款页 - 预留微信支付接口
 */
const app = getApp();

// 金额分转元
function fenToYuan(fen) {
  return (Number(fen || 0) / 100).toFixed(2);
}

Page({
  data: {
    crowdId: '',
    crowd: null,
    amount: '',
    presetAmounts: [10, 20, 50, 100],
    selectedPreset: -1,
    submitting: false,
  },

  onLoad(options) {
    // 检查登录
    this.checkLogin();

    if (options.id) {
      this.setData({ crowdId: options.id });
      this.loadCrowd(options.id);
    }
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '捐款需要先登录',
        confirmText: '去登录',
        success: (res) => {
          if (res.confirm) {
            wx.switchTab({ url: '/pages/user/profile/profile' });
          } else {
            wx.navigateBack();
          }
        }
      });
    }
  },

  async loadCrowd(id) {
    const db = wx.cloud.database();
    try {
      const { data } = await db.collection('crowdfundings').doc(id).get();
      data.raisedDisplay = fenToYuan(data.raisedAmount);
      data.targetDisplay = fenToYuan(data.targetAmount);
      this.setData({ crowd: data });
    } catch (err) {
      console.error('加载众筹信息失败:', err);
    }
  },

  // 选择预设金额
  onSelectPreset(e) {
    const amount = e.currentTarget.dataset.amount;
    this.setData({ selectedPreset: amount, amount: String(amount) });
  },

  // 自定义金额输入
  onInputAmount(e) {
    const val = e.detail.value;
    const matched = this.data.presetAmounts.find(a => String(a) === val);
    this.setData({ amount: val, selectedPreset: matched !== undefined ? matched : -1 });
  },

  // 确认捐款
  async onConfirmDonate() {
    const { amount, crowdId, crowd } = this.data;

    if (!amount || Number(amount) <= 0) {
      wx.showToast({ title: '请输入有效金额', icon: 'none' });
      return;
    }

    this.setData({ submitting: true });

    try {
      const userInfo = await app.login();
      const amountFen = Math.round(Number(amount) * 100);

      // TODO: 接入微信支付
      // 当接入微信支付后，这里需要：
      // 1. 调用云函数创建支付订单，获取支付参数
      // 2. 调用 wx.requestPayment 唤起支付
      // 3. 支付成功后记录捐款

      // 当前为演示模式，直接记录捐款
      const { result } = await wx.cloud.callFunction({
        name: 'payment-operations',
        data: {
          action: 'demo_donate',
          crowdId,
          amount: amountFen,
          donorId: app.globalData.openid,
          donorName: userInfo?.nickName || '匿名爱心人士',
        },
      });

      wx.showToast({ title: '感谢你的爱心！🐾', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      console.error('捐款失败:', err);
      wx.showToast({ title: '捐款失败，请重试', icon: 'none' });
    } finally {
      this.setData({ submitting: false });
    }
  },
});
