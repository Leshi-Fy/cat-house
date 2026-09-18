/**
 * 猫屋首页 - 探探式卡片浏览附近流浪猫
 * 按距离由近到远展示，默认5张缓冲，划走自动补充
 */
const { query, COLLECTIONS } = require('../../utils/database');
const { getDistance, formatDistance, timeAgo } = require('../../utils/util');
const app = getApp();

// ─── 配置 ───
const SWIPE_THRESHOLD = 80;
const STACK_SCALE_STEP = 0.06;
const STACK_Y_STEP = 28;
const STACK_OPACITY_STEP = 0.25;
const BUFFER_SIZE = 5;       // 卡片缓冲数量
const PAGE_SIZE = 3;         // 云函数每次拉取条数

Page({
  data: {
    cats: [],           // 已加载的猫咪（按距离排序）
    currentIndex: 0,    // 当前顶层卡片索引
    currentCat: null,
    bottomCards: [],
    location: null,
    loading: true,
    showGuide: false,
    hasMore: true,      // 云函数是否还有更多
    _page: 1,           // 云函数分页页码
    _fetching: false,   // 是否正在请求云函数
    // 拖拽状态
    dragOffsetX: 0,
    dragOffsetY: 0,
    dragRotation: 0,
    dragOpacity: 1,
    skipTagOpacity: 0,
    likeTagOpacity: 0,
    isAnimating: false,
    // 底层卡片跟随拖拽
    nextScale: 0.94,
    nextTranslateY: 28,
    nextOpacity: 0.75,
    nextTranslateX: 0,
    nextRotate: 0,
    // 消息角标
    unreadCount: 0,
  },

  _touchStartX: 0,
  _touchStartY: 0,

  async onLoad() {
    const location = await app.getLocation();
    if (location) {
      this.setData({ location });
      await this._loadInitial(location);
    } else {
      await this._loadInitialFallback();
    }
    this._loadUnreadCount();
  },

  onShow() {
    const app = getApp();
    // 从创建页返回时强制刷新列表，让新猫立刻出现
    if (app.globalData._refreshHome) {
      app.globalData._refreshHome = false;
      this.setData({ cats: [], currentIndex: 0, _page: 1, hasMore: true });
      if (this.data.location) {
        this._loadInitial(this.data.location);
      } else {
        this._loadInitialFallback();
      }
      this._loadUnreadCount();
      return;
    }

    if (this.data.location && this.data.cats.length === 0 && !this.data.loading) {
      this._loadInitial(this.data.location);
    }
    // 每次切回首页刷新角标
    this._loadUnreadCount();
  },

  onPullDownRefresh() {
    this.setData({ cats: [], currentIndex: 0, _page: 1, hasMore: true });
    if (this.data.location) {
      this._loadInitial(this.data.location).then(() => wx.stopPullDownRefresh());
    } else {
      this._loadInitialFallback().then(() => wx.stopPullDownRefresh());
    }
  },

  // ─── 数据加载 ───

  /**
   * 首次加载：拉够 BUFFER_SIZE 条数据
   */
  async _loadInitial(location) {
    this.setData({ loading: true, showGuide: false });
    const cats = await this._fetchBatch(location);
    this.setData({ cats, currentIndex: 0, loading: false });
    this._updateCardStack();
  },

  async _loadInitialFallback() {
    this.setData({ loading: true, showGuide: false });
    try {
      const raw = await query.where(COLLECTIONS.STRAY_CATS, {}, 1, BUFFER_SIZE);
      const location = this.data.location;
      let cats = raw;
      if (location) {
        cats = raw.map(cat => {
          let dist = '';
          if (cat.location && cat.location.coordinates) {
            const m = getDistance(location.latitude, location.longitude,
              cat.location.coordinates[1], cat.location.coordinates[0]);
            dist = formatDistance(m);
          }
          return { ...cat, distance: dist };
        });
      }
      this.setData({ cats, currentIndex: 0, loading: false });
      this._updateCardStack();
    } catch (err) {
      console.error('加载失败:', err);
      this.setData({ loading: false, showGuide: true });
    }
  },

  /**
   * 从云函数批量拉取，直到凑够 BUFFER_SIZE 或无更多数据
   */
  async _fetchBatch(location) {
    const { _page, cats } = this.data;
    let result = [...cats];
    let page = _page;

    while (result.length < BUFFER_SIZE && this.data.hasMore) {
      this.setData({ _fetching: true });
      try {
        const { result: res } = await wx.cloud.callFunction({
          name: 'cat-operations',
          data: {
            action: 'nearby',
            latitude: location.latitude,
            longitude: location.longitude,
            page,
            pageSize: PAGE_SIZE,
          },
        });

        const batch = (res.data || []).map(cat => {
          let dist = '';
          if (cat.distance !== undefined) {
            dist = formatDistance(cat.distance);
          } else if (cat.location && cat.location.coordinates) {
            const m = getDistance(location.latitude, location.longitude,
              cat.location.coordinates[1], cat.location.coordinates[0]);
            dist = formatDistance(m);
          }
          return { ...cat, distance: dist };
        });

        if (batch.length === 0) {
          this.setData({ hasMore: false });
          break;
        }

        // 合并并按距离重新排序（去重）
        result = result.concat(batch);
        // 按 distance 字段排序，无距离的排最后
        result.sort((a, b) => {
          const da = a.distance ? parseFloat(a.distance) : 999999;
          const db = b.distance ? parseFloat(b.distance) : 999999;
          return da - db;
        });
        // 去重
        const seen = new Set();
        result = result.filter(c => {
          if (seen.has(c._id)) return false;
          seen.add(c._id);
          return true;
        });

        page++;
        this.setData({ _page: page });

        if (batch.length < PAGE_SIZE) {
          this.setData({ hasMore: false });
          break;
        }
      } catch (err) {
        console.error('加载猫咪失败:', err);
        break;
      }
    }

    this.setData({ _fetching: false });
    return result;
  },

  // ─── 卡片堆叠更新 ───

  _updateCardStack() {
    const { cats, currentIndex } = this.data;

    if (cats.length === 0) {
      this.setData({ currentCat: null, bottomCards: [], loading: false, showGuide: true });
      return;
    }

    const currentCat = cats[currentIndex];
    const bottomCards = [];

    for (let i = 1; i <= 2; i++) {
      const idx = currentIndex + i;
      if (idx < cats.length) {
        const hash = (cats[idx]._id || '').split('').reduce((a, c) => a + c.charCodeAt(0), 0);
        const randX = ((hash * 7 + i * 13) % 17 - 8);
        const randR = ((hash * 3 + i * 11) % 5 - 2.5);

        bottomCards.push({
          ...cats[idx],
          _zIndex: 2 - i,
          _scale: 1 - i * STACK_SCALE_STEP,
          _translateY: i * STACK_Y_STEP,
          _translateX: randX,
          _rotate: randR,
          _opacity: 1 - i * STACK_OPACITY_STEP,
        });
      }
    }

    let nextScale = 0, nextTranslateY = 0, nextOpacity = 0, nextTranslateX = 0, nextRotate = 0;
    if (bottomCards.length > 0) {
      const first = bottomCards[0];
      nextScale = first._scale;
      nextTranslateY = first._translateY;
      nextOpacity = first._opacity;
      nextTranslateX = first._translateX;
      nextRotate = first._rotate;
    }

    this.setData({
      currentCat,
      bottomCards,
      loading: false,
      showGuide: false,
      nextScale,
      nextTranslateY,
      nextOpacity,
      nextTranslateX,
      nextRotate,
      dragOffsetX: 0,
      dragOffsetY: 0,
      dragRotation: 0,
      dragOpacity: 1,
      skipTagOpacity: 0,
      likeTagOpacity: 0,
      isAnimating: false,
    });
  },

  // ─── 触摸滑动逻辑 ───

  onTouchStart(e) {
    if (this.data.isAnimating) return;
    const touch = e.touches[0];
    this._touchStartX = touch.clientX;
    this._touchStartY = touch.clientY;
  },

  onTouchMove(e) {
    if (this.data.isAnimating) return;
    const touch = e.touches[0];
    const dx = touch.clientX - this._touchStartX;
    const dy = touch.clientY - this._touchStartY;

    const rotation = dx * 0.08;
    const opacity = Math.max(0.5, 1 - Math.abs(dx) / 600);

    const ratio = Math.abs(dx) / SWIPE_THRESHOLD;
    let skipTagOpacity = 0;
    let likeTagOpacity = 0;
    if (dx < -20) {
      skipTagOpacity = Math.min(1, ratio);
    } else if (dx > 20) {
      likeTagOpacity = Math.min(1, ratio);
    }

    const progress = Math.min(1, Math.abs(dx) / 300);
    const easedProgress = 1 - Math.pow(1 - progress, 3);

    this.setData({
      dragOffsetX: dx,
      dragOffsetY: dy,
      dragRotation: rotation,
      dragOpacity: opacity,
      skipTagOpacity,
      likeTagOpacity,
      nextScale: 1 - STACK_SCALE_STEP + (STACK_SCALE_STEP * easedProgress),
      nextTranslateY: STACK_Y_STEP - (STACK_Y_STEP * easedProgress),
      nextOpacity: (1 - STACK_OPACITY_STEP) + (STACK_OPACITY_STEP * easedProgress),
      nextTranslateX: this.data.nextTranslateX * (1 - easedProgress),
      nextRotate: this.data.nextRotate * (1 - easedProgress),
    });
  },

  onTouchEnd() {
    if (this.data.isAnimating) return;
    const { dragOffsetX } = this.data;

    if (Math.abs(dragOffsetX) > SWIPE_THRESHOLD) {
      this._flyOut(dragOffsetX > 0 ? 'right' : 'left');
    } else {
      this._snapBack();
    }
  },

  _flyOut(direction) {
    this.setData({ isAnimating: true });

    const flyX = direction === 'right' ? 600 : -600;
    const flyRotation = direction === 'right' ? 30 : -30;

    this.setData({
      dragOffsetX: flyX,
      dragOffsetY: -50,
      dragRotation: flyRotation,
      dragOpacity: 0,
      nextScale: 1,
      nextTranslateY: 0,
      nextOpacity: 1,
      nextTranslateX: 0,
      nextRotate: 0,
    });

    setTimeout(() => {
      if (direction === 'right') {
        const { currentCat } = this.data;
        if (currentCat) {
          wx.navigateTo({
            url: `/pages/cat/detail/detail?id=${currentCat._id}`,
            success: () => { this._goToNext(); },
            fail: () => { this._goToNext(); },
          });
          return;
        }
      }
      this._goToNext();
    }, 350);
  },

  _snapBack() {
    this.setData({ isAnimating: true });

    const { bottomCards } = this.data;
    let nextScale = 0, nextTranslateY = 0, nextOpacity = 0, nextTranslateX = 0, nextRotate = 0;
    if (bottomCards.length > 0) {
      const first = bottomCards[0];
      nextScale = first._scale;
      nextTranslateY = first._translateY;
      nextOpacity = first._opacity;
      nextTranslateX = first._translateX;
      nextRotate = first._rotate;
    }

    this.setData({
      dragOffsetX: 0, dragOffsetY: 0, dragRotation: 0, dragOpacity: 1,
      skipTagOpacity: 0, likeTagOpacity: 0,
      nextScale, nextTranslateY, nextOpacity, nextTranslateX, nextRotate,
    });

    setTimeout(() => { this.setData({ isAnimating: false }); }, 350);
  },

  /**
   * 切换到下一只猫 + 自动补充
   */
  async _goToNext() {
    const { cats, currentIndex, location } = this.data;
    const nextIndex = currentIndex + 1;

    // 如果缓冲区快用完了（剩余不足2张），异步补充
    const remaining = cats.length - nextIndex;
    if (remaining < 2 && this.data.hasMore && location && !this.data._fetching) {
      this._fetchMore(location);
    }

    if (nextIndex < cats.length) {
      this.setData({ currentIndex: nextIndex });
      this._updateCardStack();
    } else {
      this.setData({
        currentCat: null,
        bottomCards: [],
        showGuide: true,
        isAnimating: false,
      });
    }
  },

  /**
   * 异步补充更多猫咪（不阻塞当前操作）
   */
  async _fetchMore(location) {
    const newCats = await this._fetchBatch(location);
    if (newCats.length > this.data.cats.length) {
      this.setData({ cats: newCats });
    }
  },

  // ─── 按钮操作 ───

  onSwipeLeft() {
    if (this.data.isAnimating || !this.data.currentCat) return;
    this._flyOut('left');
  },

  onSwipeRight() {
    if (this.data.isAnimating || !this.data.currentCat) return;
    this._flyOut('right');
  },

  onTapCard() {
    const { currentCat } = this.data;
    if (currentCat) {
      wx.navigateTo({ url: `/pages/cat/detail/detail?id=${currentCat._id}` });
    }
  },

  // ─── 其他 ───

  goCreateCat() {
    wx.navigateTo({ url: '/pages/cat/create/create' });
  },

  goNotifications() {
    wx.navigateTo({ url: '/pages/user/notifications/notifications' });
  },

  /** 获取未读消息数量（角标） */
  async _loadUnreadCount() {
    if (!app.globalData.isLoggedIn) return;
    try {
      const { result } = await wx.cloud.callFunction({
        name: 'notify-operations',
        data: { action: 'unreadCount' },
      });
      if (result && result.success) {
        this.setData({ unreadCount: result.total || 0 });
        if (app.globalData) app.globalData.unreadCount = result.total || 0;
      }
    } catch (e) {
      // 静默失败，不影响主流程
    }
  },

  async relocate() {
    const location = await app.getLocation();
    if (location) {
      this.setData({ location, cats: [], currentIndex: 0, _page: 1, hasMore: true });
      await this._loadInitial(location);
    }
  },

  /** 图片加载失败时兜底，避免空白 */
  onPhotoError(e) {
    console.error('首页卡片图片加载失败:', e.detail);
  },
});
