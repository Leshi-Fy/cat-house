/**
 * 发布/编辑动态页面
 */
const { uploadImages } = require('../../../utils/util');

Page({
  data: {
    // 编辑模式
    isEditMode: false,
    editFeedId: null,
    // 表单
    content: '',
    images: [],          // 本地图片路径（新选择的）
    existingPhotos: [],  // 已有云存储图片（编辑模式保留）
    selectedCat: null,
    showSelector: false,
    myCats: [],
    nearbyCats: [],
    searchKeyword: '',
    isLoading: false,
  },

  onLoad(options) {
    this.checkLogin();
    this.loadMyCats();
    this.loadNearbyCats();

    // 编辑模式：解析传入的动态数据
    if (options.feedId) {
      const feed = JSON.parse(decodeURIComponent(options.feed || '{}'));
      wx.setNavigationBarTitle({ title: '编辑动态' });
      this.setData({
        isEditMode: true,
        editFeedId: options.feedId,
        content: feed.content || '',
        existingPhotos: feed.photos || [],
        selectedCat: feed.catInfo || null,
      });
    }
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    const app = getApp();
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '发布动态需要先登录',
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

  /**
   * 加载我创建的猫咪
   */
  async loadMyCats() {
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'cat-operations',
        data: { action: 'myCats' }
      });
      this.setData({ myCats: result.data || [] });
    } catch (err) {
      console.error('加载我的猫咪失败:', err);
    }
  },

  /**
   * 加载附近的猫咪
   */
  async loadNearbyCats() {
    try {
      const location = await this.getLocation();
      const { result } = await wx.cloud.callFunction({
        name: 'cat-operations',
        data: {
          action: 'nearby',
          latitude: location.latitude,
          longitude: location.longitude,
          limit: 20
        }
      });
      this.setData({ nearbyCats: result || [] });
    } catch (err) {
      console.error('加载附近猫咪失败:', err);
    }
  },

  /**
   * 获取当前位置
   */
  getLocation() {
    return new Promise((resolve, reject) => {
      wx.getLocation({
        type: 'gcj02',
        success: resolve,
        fail: reject
      });
    });
  },

  /**
   * 输入内容
   */
  onContentInput(e) {
    this.setData({ content: e.detail.value });
  },

  /**
   * 选择图片
   */
  async chooseImage() {
    try {
      const { tempFiles } = await wx.chooseMedia({
        count: 9 - this.data.images.length,
        mediaType: ['image'],
        sourceType: ['album', 'camera']
      });

      const newImages = tempFiles.map(f => f.tempFilePath);
      this.setData({
        images: [...this.data.images, ...newImages]
      });
    } catch (err) {
      console.log('取消选择');
    }
  },

  /**
   * 删除已有图片（编辑模式）
   */
  deleteExistingPhoto(e) {
    const { index } = e.currentTarget.dataset;
    const existingPhotos = [...this.data.existingPhotos];
    existingPhotos.splice(index, 1);
    this.setData({ existingPhotos });
  },

  /**
   * 删除新选图片
   */
  deleteImage(e) {
    const { index } = e.currentTarget.dataset;
    const images = [...this.data.images];
    images.splice(index, 1);
    this.setData({ images });
  },

  /**
   * 显示猫咪选择器
   */
  showCatSelector() {
    this.setData({ showSelector: true });
  },

  /**
   * 隐藏猫咪选择器
   */
  hideCatSelector() {
    this.setData({ showSelector: false });
  },

  /**
   * 阻止冒泡
   */
  preventHide() {
    // 什么都不做，阻止事件冒泡
  },

  /**
   * 搜索输入
   */
  onSearchInput(e) {
    const keyword = e.detail.value.toLowerCase();
    this.setData({ searchKeyword: keyword });
    
    // 过滤猫咪列表
    this.filterCats(keyword);
  },

  /**
   * 过滤猫咪
   */
  filterCats(keyword) {
    if (!keyword) {
      this.loadMyCats();
      this.loadNearbyCats();
      return;
    }

    const filter = cats => cats.filter(cat => 
      cat.name.toLowerCase().includes(keyword) ||
      (cat.breed && cat.breed.toLowerCase().includes(keyword))
    );

    this.setData({
      myCats: filter(this.data.myCats),
      nearbyCats: filter(this.data.nearbyCats)
    });
  },

  /**
   * 选择猫咪
   */
  selectCat(e) {
    const { cat } = e.currentTarget.dataset;
    this.setData({
      selectedCat: cat,
      showSelector: false
    });
  },

  /**
   * 更换猫咪
   */
  changeCat() {
    this.showCatSelector();
  },

  /**
   * 移除猫咪
   */
  removeCat() {
    this.setData({ selectedCat: null });
  },

  /**
   * 提交动态（新建 or 编辑）
   */
  async submitPost() {
    if (!this.data.content.trim()) {
      wx.showToast({ title: '请输入内容', icon: 'none' });
      return;
    }

    if (this.data.isLoading) return;
    this.setData({ isLoading: true });

    wx.showLoading({ title: this.data.isEditMode ? '保存中...' : '发布中...' });

    try {
      // 上传新图片
      let newPhotoUrls = [];
      if (this.data.images.length > 0) {
        newPhotoUrls = await uploadImages(this.data.images, 'feeds');
      }
      // 最终图片 = 保留的旧图 + 新上传的图
      const allPhotos = [...this.data.existingPhotos, ...newPhotoUrls];

      const catId = this.data.selectedCat?._id || null;
      const catName = this.data.selectedCat?.name || null;

      if (this.data.isEditMode) {
        // ── 编辑模式 ──
        const { result } = await wx.cloud.callFunction({
          name: 'feed-operations',
          data: {
            action: 'update',
            feedId: this.data.editFeedId,
            content: this.data.content.trim(),
            photos: allPhotos,
            catId,
            catName,
          }
        });
        if (result.error) throw new Error(result.error);

        wx.hideLoading();
        wx.showToast({ title: '保存成功', icon: 'success' });

        // 设置全局标记，让社区页等 onShow 时强制刷新
        const app = getApp();
        app.globalData._feedNeedRefresh = true;

        setTimeout(() => {
          wx.navigateBack();
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.loadMyFeeds) {
            prevPage.setData({ page: 0, hasMore: true, feeds: [] });
            prevPage.loadMyFeeds();
          }
        }, 1000);

      } else {
        // ── 新建模式 ──
        const { result } = await wx.cloud.callFunction({
          name: 'feed-operations',
          data: {
            action: 'create',
            content: this.data.content.trim(),
            photos: allPhotos,
            catId,
            catName,
          }
        });
        if (result.error) throw new Error(result.error);

        wx.hideLoading();
        wx.showToast({ title: '发布成功', icon: 'success' });

        // 设置全局标记
        const app = getApp();
        app.globalData._feedNeedRefresh = true;

        setTimeout(() => {
          wx.navigateBack();
          const pages = getCurrentPages();
          const prevPage = pages[pages.length - 2];
          if (prevPage && prevPage.loadFeeds) {
            prevPage.loadFeeds();
          }
        }, 1500);
      }

    } catch (err) {
      wx.hideLoading();
      this.setData({ isLoading: false });
      wx.showToast({ title: err.message || '操作失败', icon: 'none' });
    }
  },
});
