/**
 * 流浪猫详情页
 */
const { query, COLLECTIONS, db } = require('../../../utils/database');
const { timeAgo, formatMoney, calcCatAge, parseAgeToMonths } = require('../../../utils/util');
const CONFIG = require('../../../utils/config');
const app = getApp();

Page({
  data: {
    catId: '',
    catType: 'stray',  // stray | home
    cat: null,
    loading: true,
    isOwner: false,
    // 图片预览
    currentPhotoIndex: 0,
    showAllPhotos: false,
    // 合并申请（仅流浪猫）
    showMergeModal: false,
    mergeNote: '',
    // 筹款入口
    showCrowdEntry: false,
    // 众筹列表
    crowdfunds: [],
    crowdLoading: false,
    // 地图
    mapLatitude: 39.9042,
    mapLongitude: 116.4074,
    mapScale: 15,
    markers: [],
    circles: [],
    // 手动更新弹窗
    showEditModal: false,
    editForm: {
      ageText: '',      // 用户输入文字，如 "2岁3个月"
      healthStatus: 'good',
      description: '',
      lastSeenNote: '',
      status: 'active',
    },
    healthOptions: ['good', 'injured', 'sick', 'deceased'],
    healthLabels: ['健康', '受伤', '生病', '已去世'],
    healthIndex: 0,
    statusOptions: ['active', 'adopted', 'deceased'],
    statusLabels: ['活跃', '已领养', '已去世'],
    statusIndex: 0,
    isSubmittingEdit: false,
  },

  onLoad(options) {
    const { id, type } = options;
    if (id) {
      this.setData({ 
        catId: id, 
        catType: type === 'home' ? 'home' : 'stray',
      });
      this.loadCatDetail(id);
    }
  },

  onShow() {
    if (this.data.catId) {
      this.loadCatDetail(this.data.catId);
      this.loadCrowdfunds(this.data.catId);
    }
  },

  // 加载猫咪详情
  async loadCatDetail(id) {
    this.setData({ loading: true });
    try {
      const collection = this.data.catType === 'home' 
        ? COLLECTIONS.HOME_CATS 
        : COLLECTIONS.STRAY_CATS;
      const cat = await query.getById(collection, id);
      if (cat) {
        // 如果是已合并的副档，自动跳转到主档
        if (cat.status === 'merged' && cat.mergedInto) {
          wx.redirectTo({
            url: `/pages/cat/detail/detail?id=${cat.mergedInto}`,
          });
          return;
        }

        cat.lastSeenText = timeAgo(cat.lastSeenTime);
        cat.healthText = CONFIG.HEALTH_TEXT[cat.healthStatus] || cat.healthStatus;
        cat.sterilizedText = CONFIG.STERILIZED_TEXT[cat.sterilized] || cat.sterilized;
        cat.genderText = CONFIG.GENDER_TEXT[cat.gender] || cat.gender;

        // 实时计算年龄：ageAtCreate（月数）+ 档案创建至今经过的月数
        // 已去世的猫不叠加时间
        const isDeceased = cat.status === 'deceased';
        cat.ageDisplay = calcCatAge(cat.ageAtCreate, cat.createTime, isDeceased);

        // 生成地图 markers
        let markers = [];
        let mapLatitude = 39.9042;  // 默认北京
        let mapLongitude = 116.4074;

        if (cat.location) {
          if (cat.location.coordinates && cat.location.coordinates.length === 2) {
            // GeoJSON Point 格式 [longitude, latitude]
            mapLongitude = cat.location.coordinates[0];
            mapLatitude = cat.location.coordinates[1];
          } else if (cat.location.latitude && cat.location.longitude) {
            // 普通对象格式
            mapLatitude = cat.location.latitude;
            mapLongitude = cat.location.longitude;
          }

          markers = [{
            id: 1,
            latitude: mapLatitude,
            longitude: mapLongitude,
            title: cat.name,
            width: 30,
            height: 30,
          }];
        }

        // 生成活动范围圆形覆盖物
        let circles = [];
        if (cat.areaRadius && cat.areaRadius > 0) {
          circles = [{
            latitude: mapLatitude,
            longitude: mapLongitude,
            radius: cat.areaRadius,
            color: '#FF8C4233',
            fillColor: '#FF8C4215',
            strokeWidth: 2,
          }];
        }

        // 判断是否是自己的猫
        const isOwner = cat.creatorId === app.globalData.openid;

        this.setData({
          cat,
          isOwner,
          markers,
          circles,
          mapLatitude,
          mapLongitude,
          loading: false
        });

        // 加载该猫的众筹列表（仅流浪猫）
        if (this.data.catType === 'stray') {
          this.loadCrowdfunds(id);
        }
      } else {
        wx.showToast({ title: '猫咪不存在', icon: 'none' });
        this.setData({ loading: false });
      }
    } catch (err) {
      console.error('加载详情失败:', err);
      this.setData({ loading: false });
    }
  },

  // 查看全部照片
  onShowAllPhotos() {
    this.setData({ showAllPhotos: true });
  },

  // 照片轮播切换
  onSwiperChange(e) {
    this.setData({ currentPhotoIndex: e.detail.current });
  },

  // 预览当前照片
  onPreviewPhoto() {
    const { cat, currentPhotoIndex } = this.data;
    if (cat && cat.photos) {
      wx.previewImage({
        current: cat.photos[currentPhotoIndex],
        urls: cat.photos,
      });
    }
  },

  // 申请合并
  onMergeTap() {
    this.setData({ showMergeModal: true });
  },

  onMergeNoteInput(e) {
    this.setData({ mergeNote: e.detail.value });
  },

  async onSubmitMerge() {
    const { catId, mergeNote, cat } = this.data;
    const userInfo = await app.login();
    if (!userInfo) {
      wx.showToast({ title: '请先登录', icon: 'none' });
      return;
    }

    // 关闭弹窗，跳转到探索页选择自己创建的猫
    this.setData({ showMergeModal: false });
    wx.navigateTo({
      url: `/pages/cat/explore/explore?mode=merge&toCatId=${catId}&toCatName=${encodeURIComponent(cat.name)}&note=${encodeURIComponent(mergeNote || '疑似同一只猫')}`,
    });
  },

  onCancelMerge() {
    this.setData({ showMergeModal: false, mergeNote: '' });
  },

  // 加载该猫的众筹列表
  async loadCrowdfunds(catId) {
    this.setData({ crowdLoading: true });
    try {
      const _ = db.command;
      const res = await db.collection(COLLECTIONS.CROWDFUNDS)
        .where({ catId })
        .orderBy('createTime', 'desc')
        .limit(20)
        .get();

      const CROWD_TYPE_TEXT = CONFIG.CROWD_TYPE_TEXT;
      const STATUS_TEXT = {
        ongoing: '进行中',
        completed: '已完成',
        cancelled: '已取消',
      };

      const crowdfunds = res.data.map(item => {
        const target = (item.targetAmount || 0) / 100;
        const raised = (item.raisedAmount || 0) / 100;
        const percent = target > 0 ? Math.min(100, (raised / target * 100)).toFixed(1) : 0;
        return {
          ...item,
          typeText: CROWD_TYPE_TEXT[item.crowdType] || item.crowdType,
          statusText: STATUS_TEXT[item.status] || item.status,
          targetDisplay: target.toFixed(2),
          raisedDisplay: raised.toFixed(2),
          percent,
          timeText: timeAgo(item.createTime),
        };
      });

      this.setData({ crowdfunds, crowdLoading: false });
    } catch (err) {
      console.error('加载众筹列表失败:', err);
      this.setData({ crowdLoading: false });
    }
  },

  // 查看众筹详情
  onCrowdDetail(e) {
    const id = e.currentTarget.dataset.id;
    wx.navigateTo({ url: `/pages/crowd/detail/detail?id=${id}` });
  },

  // 发起众筹
  onCrowdTap() {
    const { catId, cat } = this.data;
    wx.navigateTo({
      url: `/pages/crowd/create/create?catId=${catId}&catName=${cat.name}&catPhoto=${cat.photos[0] || ''}`,
    });
  },

  // 查看地图位置 - 唤起手机地图软件
  onOpenLocation() {
    const { cat, mapLatitude, mapLongitude } = this.data;
    if (cat && cat.location && mapLatitude && mapLongitude) {
      wx.openLocation({
        latitude: mapLatitude,
        longitude: mapLongitude,
        name: cat.name,
        address: cat.location.address || `活动半径 ${cat.areaRadius || 500}m`,
        scale: 15,
      });
    } else {
      wx.showToast({ title: '位置信息不完整', icon: 'none' });
    }
  },

  // 分享
  onShareAppMessage() {
    const { cat } = this.data;
    return {
      title: `${cat.name} - 流浪猫档案 | 猫屋`,
      path: `/pages/cat/detail/detail?id=${cat._id}`,
      imageUrl: cat.photos[0] || '',
    };
  },

  // ─── 手动更新数据 ───────────────────────────────────────

  /** 打开编辑弹窗 */
  onOpenEdit() {
    const { cat, healthOptions, statusOptions } = this.data;
    const healthIndex = healthOptions.indexOf(cat.healthStatus || 'good');
    const statusIndex = statusOptions.indexOf(cat.status || 'active');

    // 将 ageAtCreate（月数）反显为文字，方便用户知道当前值
    let ageText = '';
    if (cat.ageAtCreate !== undefined && cat.ageAtCreate !== null && cat.ageAtCreate !== '') {
      const m = Number(cat.ageAtCreate);
      if (!isNaN(m) && m >= 0) {
        if (m < 12) {
          ageText = m < 1 ? '' : `${m}个月`;
        } else {
          const yr = Math.floor(m / 12);
          const mo = m % 12;
          ageText = mo === 0 ? `${yr}岁` : `${yr}岁${mo}个月`;
        }
      }
    }

    this.setData({
      showEditModal: true,
      editForm: {
        ageText,
        healthStatus: cat.healthStatus || 'good',
        description: cat.description || '',
        lastSeenNote: '',
        status: cat.status || 'active',
      },
      healthIndex: healthIndex >= 0 ? healthIndex : 0,
      statusIndex: statusIndex >= 0 ? statusIndex : 0,
    });
  },

  onCloseEdit() {
    this.setData({ showEditModal: false });
  },

  onEditAgeInput(e) {
    this.setData({ 'editForm.ageText': e.detail.value });
  },

  onEditDescInput(e) {
    this.setData({ 'editForm.description': e.detail.value });
  },

  onEditLastSeenInput(e) {
    this.setData({ 'editForm.lastSeenNote': e.detail.value });
  },

  onEditHealthChange(e) {
    const idx = +e.detail.value;
    this.setData({
      healthIndex: idx,
      'editForm.healthStatus': this.data.healthOptions[idx],
    });
  },

  onEditStatusChange(e) {
    const idx = +e.detail.value;
    this.setData({
      statusIndex: idx,
      'editForm.status': this.data.statusOptions[idx],
    });
  },

  /** 提交手动更新 */
  async onSubmitEdit() {
    const { catId, editForm, isSubmittingEdit } = this.data;
    if (isSubmittingEdit) return;
    this.setData({ isSubmittingEdit: true });

    try {
      const updateData = {
        ageAtCreate: parseAgeToMonths(editForm.ageText),  // 存月数，null 表示未填
        healthStatus: editForm.healthStatus,
        description: editForm.description,
        status: editForm.status,
      };
      // 如果填写了最新目击备注，更新 lastSeenTime
      if (editForm.lastSeenNote && editForm.lastSeenNote.trim()) {
        updateData.lastSeenNote = editForm.lastSeenNote.trim();
        updateData.lastSeenTime = new Date();
      }

      const { result } = await wx.cloud.callFunction({
        name: 'cat-operations',
        data: { action: 'update', catId, updateData },
      });

      if (result.error) throw new Error(result.error);

      wx.showToast({ title: '更新成功', icon: 'success' });
      this.setData({ showEditModal: false, isSubmittingEdit: false });
      // 刷新详情
      this.loadCatDetail(catId);
    } catch (err) {
      console.error('更新失败:', err);
      this.setData({ isSubmittingEdit: false });
      wx.showToast({ title: err.message || '更新失败', icon: 'none' });
    }
  },
});
