/**
 * 我的钱包
 * 余额 = 报销入账(paid) − 提现(pending+paid 冻结)
 * 提现：提交即生成 pending 流水（冻结额度），由平台线下打款后置为 paid。
 */
const api = require('../../../utils/api');
const { timeAgo } = require('../../../utils/util');

const PAGE_SIZE = 20;

Page({
  data: {
    balance: 0,          // 可提现余额（分）
    balanceText: '¥0.00',
    totalIncome: 0,      // 累计入账（分）
    totalWithdraw: 0,    // 累计提现（含冻结，分）
    transactions: [],
    page: 0,
    hasMore: true,
    isLoading: false,
    withdrawing: false,
  },

  onShow() {
    this.setData({ page: 0, hasMore: true, transactions: [] });
    this.loadSummary();
    this.loadTransactions(true);
  },

  onPullDownRefresh() {
    this.setData({ page: 0, hasMore: true, transactions: [] });
    Promise.all([this.loadSummary(), this.loadTransactions(true)])
      .then(() => wx.stopPullDownRefresh())
      .catch(() => wx.stopPullDownRefresh());
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.isLoading) this.loadTransactions(false);
  },

  async loadSummary() {
    try {
      const { result } = await api.callFunction('wallet-operations', { action: 'summary' });
      if (result && !result.error) {
        const balance = result.balance || 0;
        const income = result.totalIncome || 0;
        const withdraw = result.totalWithdraw || 0;
        this.setData({
          balance,
          balanceText: '¥' + (balance / 100).toFixed(2),
          totalIncome: income,
          totalIncomeText: '¥' + (income / 100).toFixed(2),
          totalWithdraw: withdraw,
          totalWithdrawText: '¥' + (withdraw / 100).toFixed(2),
        });
      }
    } catch (e) {
      console.error('加载钱包余额失败', e);
    }
  },

  async loadTransactions(reset) {
    if (this.data.isLoading) return;
    const page = reset ? 0 : this.data.page;
    this.setData({ isLoading: true, page });
    try {
      const { result } = await api.callFunction('wallet-operations', {
        action: 'transactions', page, pageSize: PAGE_SIZE,
      });
      if (!result || result.error) throw new Error(result.error || '加载失败');
      const list = (result.data || []).map(t => ({
        ...t,
        timeText: timeAgo(t.createTime),
      }));
      const items = reset ? list : this.data.transactions.concat(list);
      this.setData({
        transactions: items,
        hasMore: list.length >= PAGE_SIZE,
        isLoading: false,
        page: page + 1,
      });
    } catch (e) {
      this.setData({ isLoading: false });
      wx.showToast({ title: e.message || '加载失败', icon: 'none' });
    }
  },

  // 发起提现
  onWithdraw() {
    if (this.data.balance <= 0) {
      wx.showModal({
        title: '暂无可提现余额',
        content: '报销申请通过并入账后，方可提现。',
        showCancel: false,
      });
      return;
    }
    wx.showModal({
      title: '申请提现',
      editable: true,
      placeholderText: '请输入提现金额（元），当前可提现 ¥' + (this.data.balance / 100).toFixed(2),
      success: async (res) => {
        if (!res.confirm) return;
        const yuan = parseFloat(res.content);
        if (!yuan || yuan <= 0) {
          wx.showToast({ title: '请输入有效金额', icon: 'none' });
          return;
        }
        const amountFen = Math.round(yuan * 100);
        if (amountFen > this.data.balance) {
          wx.showToast({ title: '超出可提现余额', icon: 'none' });
          return;
        }
        this.setData({ withdrawing: true });
        wx.showLoading({ title: '提交中...' });
        try {
          const { result } = await api.callFunction('wallet-operations', {
            action: 'withdraw', amount: amountFen, remark: '用户自助提现',
          });
          wx.hideLoading();
          this.setData({ withdrawing: false });
          if (result && result.error) throw new Error(result.error);
          wx.showModal({
            title: '提交成功',
            content: '提现申请已提交，平台将在核对后打款。打款通道（微信企业付款）开发中。',
            showCancel: false,
          });
          this.setData({ page: 0, hasMore: true, transactions: [] });
          this.loadSummary();
          this.loadTransactions(true);
        } catch (e) {
          wx.hideLoading();
          this.setData({ withdrawing: false });
          wx.showToast({ title: e.message || '提交失败', icon: 'none' });
        }
      },
    });
  },
});
