/**
 * 报销审核（平台管理员）
 * 仅管理员可见（profile 页按 isAdmin 控制入口）。
 * 通过：金额从众筹额度扣除并转入发起人钱包；驳回：通知发起人。
 */
const api = require('../../../utils/api');

Page({
  data: {
    list: [],
    isLoading: false,
    processingId: '',
  },

  onShow() {
    this.loadPending();
  },

  onPullDownRefresh() {
    this.loadPending().then(() => wx.stopPullDownRefresh());
  },

  async loadPending() {
    if (this.data.isLoading) return;
    this.setData({ isLoading: true });
    try {
      const { result } = await api.callFunction('crowd-operations', { action: 'pending_receipts' });
      if (result && result.error) throw new Error(result.error);
      const list = (result || []).map(it => {
        const r = it.receipt || {};
        const amt = r.amount || 0;
        return {
          ...it,
          amountFen: amt,
          amountText: '¥' + (amt / 100).toFixed(2),
          availableText: '¥' + ((it.availableBalance || 0) / 100).toFixed(2),
          raisedText: '¥' + ((it.raisedAmount || 0) / 100).toFixed(2),
          remark: r.remark || '',
          receipts: Array.isArray(r.receipts) ? r.receipts : [],
          _id: r._id,
          createTime: r.create_time,
        };
      });
      this.setData({ list, isLoading: false });
    } catch (e) {
      this.setData({ isLoading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  // 预览发票图片
  previewImage(e) {
    const { url } = e.currentTarget.dataset;
    const { urls } = e.currentTarget.dataset;
    wx.previewImage({ current: url, urls: urls || [url] });
  },

  async onApprove(e) {
    const { crowdId, receiptId } = e.currentTarget.dataset;
    const key = crowdId + '|' + receiptId;
    if (this.data.processingId) return;
    const res = await new Promise(resolve => wx.showModal({
      title: '通过报销',
      content: '通过后金额将转入发起人钱包，且不可撤销。确认通过？',
      confirmColor: '#07c160',
      success: resolve,
    }));
    if (!res.confirm) return;
    this.setData({ processingId: key });
    wx.showLoading({ title: '处理中...' });
    try {
      const { result } = await api.callFunction('crowd-operations', {
        action: 'approve_receipt', crowdId, receiptId, approved: true,
      });
      wx.hideLoading();
      this.setData({ processingId: '' });
      if (result && result.error) throw new Error(result.error);
      wx.showToast({ title: '已通过', icon: 'success' });
      this.loadPending();
    } catch (err) {
      wx.hideLoading();
      this.setData({ processingId: '' });
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },

  async onReject(e) {
    const { crowdId, receiptId } = e.currentTarget.dataset;
    const key = crowdId + '|' + receiptId;
    if (this.data.processingId) return;
    const res = await new Promise(resolve => wx.showModal({
      title: '驳回报销',
      editable: true,
      placeholderText: '驳回原因（选填）',
      success: resolve,
    }));
    if (!res.confirm) return;
    this.setData({ processingId: key });
    wx.showLoading({ title: '处理中...' });
    try {
      const { result } = await api.callFunction('crowd-operations', {
        action: 'approve_receipt', crowdId, receiptId, approved: false,
      });
      wx.hideLoading();
      this.setData({ processingId: '' });
      if (result && result.error) throw new Error(result.error);
      wx.showToast({ title: '已驳回', icon: 'success' });
      this.loadPending();
    } catch (err) {
      wx.hideLoading();
      this.setData({ processingId: '' });
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },
});
