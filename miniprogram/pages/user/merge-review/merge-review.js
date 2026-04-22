/**
 * 合并审核页 - 查看和处理合并申请
 */
const { COLLECTIONS } = require('../../../utils/database');
const { formatDate } = require('../../../utils/util');
const CONFIG = require('../../../utils/config');
const app = getApp();

Page({
  data: {
    activeTab: 'received', // received(收到) | sent(发出)
    receivedList: [],
    sentList: [],
    pendingCount: 0,
    loading: true,
  },

  onLoad(options) {
    if (options.tab) {
      this.setData({ activeTab: options.tab });
    }
  },

  onShow() {
    this.loadAll();
  },

  onTabChange(e) {
    this.setData({ activeTab: e.currentTarget.dataset.tab });
  },

  async loadAll() {
    this.setData({ loading: true });
    const openid = app.globalData.openid;
    if (!openid) {
      this.setData({ loading: false });
      return;
    }

    try {
      // 调用云函数获取合并申请列表
      const res = await wx.cloud.callFunction({
        name: 'merge-operations',
        data: { action: 'list', userId: openid },
      });
      const list = res.result || [];

      // 分为收到的和发出的
      const received = [];
      const sent = [];

      list.forEach(item => {
        const row = {
          ...item,
          statusText: CONFIG.MERGE_STATUS_TEXT[item.status] || item.status,
          statusClass: item.status === 'pending' ? 'status-pending'
            : item.status === 'approved' ? 'status-approved'
            : 'status-rejected',
          timeText: formatDate(item.createTime, 'YYYY-MM-DD HH:mm'),
        };
        if (item.toUserId === openid) {
          received.push(row);
        } else {
          sent.push(row);
        }
      });

      const pendingCount = received.filter(item => item.status === 'pending').length;

      this.setData({
        receivedList: received,
        sentList: sent,
        pendingCount,
        loading: false,
      });
    } catch (err) {
      console.error('加载合并申请失败:', err);
      this.setData({ loading: false });
    }
  },

  // 同意合并
  onApprove(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '确认合并',
      content: '合并后两个档案将合为一个，照片和信息会合并到创建时间较早的档案中，确定同意吗？',
      confirmColor: '#FF8C42',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await wx.cloud.callFunction({
            name: 'merge-operations',
            data: { action: 'approve', requestId: id },
          });
          wx.hideLoading();
          wx.showToast({ title: '已同意合并', icon: 'success' });
          this.loadAll();
        } catch (err) {
          wx.hideLoading();
          console.error('同意合并失败:', err);
          wx.showToast({ title: err.errMsg || '操作失败', icon: 'none' });
        }
      },
    });
  },

  // 拒绝合并
  onReject(e) {
    const { id } = e.currentTarget.dataset;
    wx.showModal({
      title: '拒绝合并',
      content: '确定拒绝这个合并申请吗？',
      confirmColor: '#FF8C42',
      confirmText: '拒绝',
      success: async (res) => {
        if (!res.confirm) return;
        wx.showLoading({ title: '处理中...' });
        try {
          await wx.cloud.callFunction({
            name: 'merge-operations',
            data: { action: 'reject', requestId: id },
          });
          wx.hideLoading();
          wx.showToast({ title: '已拒绝', icon: 'success' });
          this.loadAll();
        } catch (err) {
          wx.hideLoading();
          console.error('拒绝合并失败:', err);
          wx.showToast({ title: err.errMsg || '操作失败', icon: 'none' });
        }
      },
    });
  },

  // 查看猫咪详情
  onTapCat(e) {
    const { id } = e.currentTarget.dataset;
    if (id) {
      wx.navigateTo({ url: `/pages/cat/detail/detail?id=${id}` });
    }
  },
});
