/**
 * 报销申请页 - 发起人上传发票申请报销
 */
const { chooseImage, uploadImages, showError } = require('../../../utils/util');
const app = getApp();

Page({
  data: {
    crowdId: '',
    receipts: [],  // 发票图片
    remark: '',
    amount: '',
    submitting: false,
    availableText: '¥0.00',  // 可报销余额
  },

  onLoad(options) {
    // 检查登录
    this.checkLogin();

    if (options.id) {
      this.setData({ crowdId: options.id });
      this.loadCrowd(options.id);
    }
  },

  // 拉取众筹详情，展示可报销余额（含已报销/冻结口径）
  async loadCrowd(crowdId) {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'crowd-operations', data: { action: 'detail', crowdId },
      });
      if (result && !result.error) {
        this.setData({
          availableText: result.availableBalanceText || '¥0.00',
        });
      }
    } catch (e) {}
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '申请报销需要先登录',
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

  // 添加发票图片
  async addReceipt() {
    try {
      const res = await chooseImage(9 - this.data.receipts.length);
      this.setData({
        receipts: [...this.data.receipts, ...res.tempFiles.map(f => f.tempFilePath)],
      });
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
    }
  },

  onDeleteReceipt(e) {
    const idx = e.currentTarget.dataset.index;
    const receipts = [...this.data.receipts];
    receipts.splice(idx, 1);
    this.setData({ receipts });
  },

  onInputAmount(e) {
    this.setData({ amount: e.detail.value });
  },

  onInputRemark(e) {
    this.setData({ remark: e.detail.value });
  },

  async onSubmit() {
    const { crowdId, receipts, amount, remark } = this.data;

    if (receipts.length === 0) {
      showError('请上传发票');
      return;
    }
    if (!amount || Number(amount) <= 0) {
      showError('请输入报销金额');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '提交中...', mask: true });

    try {
      const uploadedReceipts = await uploadImages(
        receipts.map(p => ({ tempFilePath: p })),
        'receipts'
      );

      await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: {
          action: 'apply_receipt',
          crowdId,
          amount: Math.round(Number(amount) * 100),
          remark,
          receipts: uploadedReceipts,
          applicantId: app.globalData.openid,
        },
      });

      wx.hideLoading();
      wx.showToast({ title: '报销申请已提交', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      console.error('提交报销失败:', err);
      showError('提交失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
