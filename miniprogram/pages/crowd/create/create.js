/**
 * 创建众筹项目
 */
const { query, COLLECTIONS } = require('../../../utils/database');
const { chooseImage, uploadImages, showError } = require('../../../utils/util');
const CONFIG = require('../../../utils/config');
const app = getApp();

Page({
  data: {
    form: {
      catId: '',
      catName: '',
      catPhoto: '',
      crowdType: 'food',
      description: '',
      targetAmount: '',
      deadline: '',
    },
    typeOptions: [
      { value: 'food', label: '🍖 食物' },
      { value: 'sterilize', label: '🏥 绝育' },
      { value: 'medical', label: '💊 医疗' },
      { value: 'other', label: '📦 其他' },
    ],
    typeIndex: 0,
    photos: [],
    minDate: '',
    submitting: false,
  },

  onLoad(options) {
    // 检查登录
    this.checkLogin();

    // 设置最小日期为明天
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];
    this.setData({ minDate });

    // 从猫咪详情页跳转过来时自动填充
    if (options.catId) {
      this.setData({
        'form.catId': options.catId,
        'form.catName': options.catName || '',
        'form.catPhoto': options.catPhoto || '',
      });
    }
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '创建众筹需要先登录',
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

  // 类型选择
  onTypeChange(e) {
    const value = e.currentTarget.dataset.value;
    const index = e.currentTarget.dataset.index;
    this.setData({
      typeIndex: index,
      'form.crowdType': value,
    });
  },

  // 表单输入
  onInputDesc(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  onInputAmount(e) {
    this.setData({ 'form.targetAmount': e.detail.value });
  },

  onDeadlineChange(e) {
    this.setData({ 'form.deadline': e.detail.value });
  },

  // 选择猫咪
  onChooseCat() {
    wx.navigateTo({
      url: '/pages/cat/explore/explore?mode=pick',
    });
  },

  // 添加图片
  async addPhotos() {
    try {
      const res = await chooseImage(9 - this.data.photos.length);
      this.setData({
        photos: [...this.data.photos, ...res.tempFiles.map(f => f.tempFilePath)],
      });
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
    }
  },

  onDeletePhoto(e) {
    const idx = e.currentTarget.dataset.index;
    const photos = [...this.data.photos];
    photos.splice(idx, 1);
    this.setData({ photos });
  },

  // 提交
  async onSubmit() {
    const { form, photos } = this.data;

    if (!form.catName) {
      showError('请选择救助猫咪');
      return;
    }
    if (!form.description.trim()) {
      showError('请填写项目描述');
      return;
    }
    if (!form.targetAmount || Number(form.targetAmount) <= 0) {
      showError('请输入有效的目标金额');
      return;
    }
    if (!form.deadline) {
      showError('请选择截止日期');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '创建中...', mask: true });

    try {
      const userInfo = await app.login();

      // 上传图片
      let uploadedPhotos = [];
      if (photos.length > 0) {
        uploadedPhotos = await uploadImages(
          photos.map(p => ({ tempFilePath: p })),
          'crowdfund'
        );
      }

      const crowdData = {
        ...form,
        targetAmount: Math.round(Number(form.targetAmount) * 100), // 元转分
        raisedAmount: 0,
        status: 'ongoing',
        photos: uploadedPhotos,
        initiatorId: app.globalData.openid,
        initiatorName: userInfo?.nickName || '匿名用户',
        deadline: new Date(form.deadline + 'T23:59:59'),
      };

      await wx.cloud.callFunction({
        name: 'crowd-operations',
        data: { action: 'create', crowdData },
      });

      wx.hideLoading();
      wx.showToast({ title: '众筹发起成功！', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1500);
    } catch (err) {
      console.error('创建众筹失败:', err);
      showError('创建失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
