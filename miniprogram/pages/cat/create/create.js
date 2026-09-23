/**
 * 创建流浪猫档案
 */
const { db, COLLECTIONS, query } = require('../../../utils/database');
const { chooseImage, uploadImages, showError, generateId, parseAgeToMonths } = require('../../../utils/util');
const app = getApp();

Page({
  data: {
    // 表单数据
    form: {
      name: '',
      description: '',
      gender: 'unknown',
      sterilized: 'unknown',
      healthStatus: 'good',
      ageText: '',   // 用户输入的年龄文本，如 "1岁3个月"
      photos: [],
      areaRadius: 500,
    },
    // UI 状态
    genderOptions: [
      { value: 'unknown', label: '未知' },
      { value: 'male', label: '♂ 公' },
      { value: 'female', label: '♀ 母' },
    ],
    sterilizedOptions: [
      { value: 'unknown', label: '未知' },
      { value: 'yes', label: '已绝育' },
      { value: 'no', label: '未绝育' },
    ],
    healthOptions: [
      { value: 'good', label: '😊 健康' },
      { value: 'fair', label: '😐 一般' },
      { value: 'poor', label: '😟 较差' },
      { value: 'injured', label: '🤕 受伤' },
    ],
    genderIndex: 0,
    sterilizedIndex: 0,
    healthIndex: 0,
    // 地图
    location: null,
    circles: [],
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 15,
    // 提交状态
    submitting: false,
  },

  async onLoad() {
    this.checkLogin();
    // 如果没有昵称，提示先完善个人资料
    const userInfo = app.globalData.userInfo;
    if (userInfo && !userInfo.nickName) {
      wx.showModal({
        title: '完善资料',
        content: '给自己起个昵称吧，方便大家认识你 😊',
        confirmText: '去设置',
        cancelText: '跳过',
        success: (res) => {
          if (res.confirm) {
            wx.navigateTo({ url: '/pages/user/edit-profile/edit-profile' });
          }
        }
      });
    }
    const location = await app.getLocation();
    if (location) {
      const circles = this._buildCircles(location.latitude, location.longitude, 500);
      this.setData({
        location,
        latitude: location.latitude,
        longitude: location.longitude,
        circles,
      });
    }
  },

  // 表单输入
  onInputName(e) {
    this.setData({ 'form.name': e.detail.value });
  },

  onInputDesc(e) {
    this.setData({ 'form.description': e.detail.value });
  },

  onInputAge(e) {
    this.setData({ 'form.ageText': e.detail.value });
  },

  // 选择器
  onGenderChange(e) {
    const idx = e.detail.value;
    this.setData({
      genderIndex: idx,
      'form.gender': this.data.genderOptions[idx].value,
    });
  },

  onSterilizedChange(e) {
    const idx = e.detail.value;
    this.setData({
      sterilizedIndex: idx,
      'form.sterilized': this.data.sterilizedOptions[idx].value,
    });
  },

  onHealthChange(e) {
    const idx = e.detail.value;
    this.setData({
      healthIndex: idx,
      'form.healthStatus': this.data.healthOptions[idx].value,
    });
  },

  // 添加照片
  async addPhotos() {
    try {
      const res = await chooseImage(9 - this.data.form.photos.length);
      const newPhotos = res.tempFiles.map(f => f.tempFilePath);
      this.setData({
        'form.photos': [...this.data.form.photos, ...newPhotos],
      });
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
      console.error('选择图片失败:', err);
    }
  },

  // 预览照片
  onPreviewPhoto(e) {
    const { url } = e.currentTarget.dataset;
    wx.previewImage({
      current: url,
      urls: this.data.form.photos,
    });
  },

  // 删除照片
  onDeletePhoto(e) {
    const { index } = e.currentTarget.dataset;
    const photos = [...this.data.form.photos];
    photos.splice(index, 1);
    this.setData({ 'form.photos': photos });
  },

  // 拖拽/缩放地图结束，自动更新中心位置
  onRegionChange(e) {
    // 缩放时不更新坐标（大头针始终在屏幕中央，坐标不变）
    if (e.causedBy === 'scale') return;
    // 只有拖拽结束时才更新坐标
    if (e.type === 'end' && e.causedBy === 'drag') {
      const mapCtx = wx.createMapContext('catMap', this);
      mapCtx.getCenterLocation({
        success: (res) => {
          const circles = this._buildCircles(res.latitude, res.longitude, this.data.form.areaRadius);
          this.setData({
            latitude: res.latitude,
            longitude: res.longitude,
            circles,
          });
        },
      });
    }
  },

  // 构建地图圆形覆盖物
  _buildCircles(latitude, longitude, radius) {
    return [{
      latitude,
      longitude,
      radius,
      color: '#FF8C4233',
      fillColor: '#FF8C4215',
      strokeWidth: 2,
    }];
  },

  // 滑块调整活动范围
  onRadiusChange(e) {
    const radius = e.detail.value;
    const circles = this._buildCircles(this.data.latitude, this.data.longitude, radius);
    this.setData({
      'form.areaRadius': radius,
      circles,
    });
  },

  // 预设按钮设置活动范围
  onPresetRadius(e) {
    const radius = Number(e.currentTarget.dataset.value);
    const circles = this._buildCircles(this.data.latitude, this.data.longitude, radius);
    this.setData({
      'form.areaRadius': radius,
      circles,
    });
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '创建猫咪档案需要先登录',
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

  // 提交表单
  async onSubmit() {
    const { form } = this.data;

    // 表单验证
    if (!form.name.trim()) {
      showError('请输入猫咪名字');
      return;
    }
    if (form.photos.length === 0) {
      showError('请至少上传一张照片');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '上传中...', mask: true });

    try {
      // 上传照片
      const uploadedPhotos = await uploadImages(
        form.photos.map(p => ({ tempFilePath: p })),
        'stray-cats'
      );

      if (uploadedPhotos.length === 0) {
        showError('照片上传失败，请重试');
        this.setData({ submitting: false });
        return;
      }

      // 确保用户已登录
      const userInfo = await app.login();
      if (!userInfo) {
        showError('请先登录');
        this.setData({ submitting: false });
        return;
      }

      // 从云端读取最新昵称（用户可能已在个人中心填写）
      let creatorName = userInfo.nickName || '';
      try {
        const { result: latestUser } = await wx.cloud.callFunction({ name: 'login' });
        if (latestUser && latestUser.userInfo && latestUser.userInfo.nickName) {
          creatorName = latestUser.userInfo.nickName;
        }
      } catch (e) {
        console.warn('获取用户信息失败，使用缓存:', e);
      }
      if (!creatorName) creatorName = '猫友';

      // 创建档案
      const { latitude, longitude } = this.data;
      let location = null;
      if (latitude && longitude) {
        try {
          // 使用 GeoJSON Point 格式，支持地理位置索引查询
          location = db.Geo.Point(longitude, latitude);
        } catch (e) {
          console.error('创建地理位置失败:', e);
        }
      }

      const catData = {
        name: form.name,
        description: form.description,
        gender: form.gender,
        sterilized: form.sterilized,
        healthStatus: form.healthStatus,
        ageAtCreate: parseAgeToMonths(form.ageText),  // 月数，null 表示未填
        photos: uploadedPhotos,
        creatorId: app.globalData.openid,
        creatorName,
        lastSeenTime: new Date(),
        status: 'active',
        location,
        areaRadius: form.areaRadius,
        mergeChain: [], // 合并链
        aliases: [],     // 别名
      };

      // 使用云函数创建（支持地理位置索引）
      const { result } = await wx.cloud.callFunction({
        name: 'cat-operations',
        data: { action: 'create', catData },
      });

      // 后端业务错误会被 api.js 归一化成 { result: { error } }，这里必须显式拦截，
      // 否则会走到下面直接提示"创建成功"，实际并没写库（表现为首页看不到新猫）
      if (!result || result.error || !result.catId) {
        wx.hideLoading();
        showError('创建失败：' + ((result && result.error) || '后端未返回 catId'));
        this.setData({ submitting: false });
        return;
      }

      wx.hideLoading();
      wx.showToast({ title: '创建成功！🐾', icon: 'success' });

      setTimeout(() => {
        // 告诉首页回来要刷新，这样新建后能立刻看到
        app.globalData._refreshHome = true;
        wx.navigateBack();
      }, 1500);
    } catch (err) {
      console.error('创建流浪猫档案失败:', err);
      showError('创建失败，请重试');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
