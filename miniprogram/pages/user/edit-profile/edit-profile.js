/**
 * 编辑个人资料 / 添加家养猫
 */
const { query, COLLECTIONS, db } = require('../../../utils/database');
const { chooseImage, uploadImages, showError, generateId } = require('../../../utils/util');
const app = getApp();

Page({
  data: {
    mode: 'profile', // profile | addCat
    // 用户资料
    profile: {
      nickName: '',
      bio: '',
      hobbies: '',
      catPreference: '',
    },
    avatarUrl: '',
    // 家养猫表单
    catForm: {
      name: '',
      breed: '',
      age: '',
      gender: 'unknown',
      personality: '',
      photos: [],
    },
    genderOptions: [
      { value: 'unknown', label: '未知' },
      { value: 'male', label: '♂ 公' },
      { value: 'female', label: '♀ 母' },
    ],
    catGenderIndex: 0,
    submitting: false,
  },

  onLoad(options) {
    // 检查登录
    this.checkLogin();

    if (options.mode === 'addCat') {
      this.setData({ mode: 'addCat' });
      wx.setNavigationBarTitle({ title: '添加家养猫' });
    } else {
      this.loadProfile();
    }
  },

  /**
   * 检查登录状态
   */
  checkLogin() {
    if (!app.globalData.userInfo) {
      wx.showModal({
        title: '需要登录',
        content: '编辑资料需要先登录',
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

  async loadProfile() {
    const openid = app.globalData.openid;
    if (!openid) return;

    try {
      const user = await query.getById(COLLECTIONS.USERS, openid);
      if (user) {
        this.setData({
          profile: {
            nickName: user.nickName || '',
            bio: user.bio || '',
            hobbies: user.hobbies || '',
            catPreference: user.catPreference || '',
          },
          avatarUrl: user.avatarUrl || '',
        });
      }
    } catch (err) {
      console.error('加载资料失败:', err);
    }
  },

  // 选择头像
  async onChooseAvatar() {
    try {
      const res = await chooseImage(1, ['compressed'], ['album', 'camera']);
      this.setData({ avatarUrl: res.tempFiles[0].tempFilePath });
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
    }
  },

  // 资料输入
  onInputNickName(e) { this.setData({ 'profile.nickName': e.detail.value }); },
  onInputBio(e) { this.setData({ 'profile.bio': e.detail.value }); },
  onInputHobbies(e) { this.setData({ 'profile.hobbies': e.detail.value }); },
  onInputCatPreference(e) { this.setData({ 'profile.catPreference': e.detail.value }); },

  // 家养猫表单
  onCatNameInput(e) { this.setData({ 'catForm.name': e.detail.value }); },
  onCatBreedInput(e) { this.setData({ 'catForm.breed': e.detail.value }); },
  onCatAgeInput(e) { this.setData({ 'catForm.age': e.detail.value }); },
  onCatPersonalityInput(e) { this.setData({ 'catForm.personality': e.detail.value }); },
  onCatGenderChange(e) {
    const idx = e.detail.value;
    this.setData({ catGenderIndex: idx, 'catForm.gender': this.data.genderOptions[idx].value });
  },

  async addCatPhotos() {
    try {
      const res = await chooseImage(9 - this.data.catForm.photos.length);
      this.setData({
        'catForm.photos': [...this.data.catForm.photos, ...res.tempFiles.map(f => f.tempFilePath)],
      });
    } catch (err) {
      if (err.errMsg && err.errMsg.includes('cancel')) return;
    }
  },

  onDeleteCatPhoto(e) {
    const idx = e.currentTarget.dataset.index;
    const photos = [...this.data.catForm.photos];
    photos.splice(idx, 1);
    this.setData({ 'catForm.photos': photos });
  },

  // 保存个人资料
  async onSaveProfile() {
    const { profile, avatarUrl } = this.data;
    if (!profile.nickName.trim()) {
      showError('请输入昵称');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      let finalAvatarUrl = avatarUrl;
      if (avatarUrl && (avatarUrl.startsWith('http://tmp') || avatarUrl.startsWith('wxfile://'))) {
        const [fileID] = await uploadImages([{ tempFilePath: avatarUrl }], 'avatars');
        finalAvatarUrl = fileID || avatarUrl;
      }

      const openid = app.globalData.openid;
      const userData = {
        _id: openid,
        _openid: openid,
        ...profile,
        avatarUrl: finalAvatarUrl,
        updateTime: db.serverDate(),
      };

      // upsert
      try {
        await db.collection(COLLECTIONS.USERS).doc(openid).update({
          data: { ...profile, avatarUrl: finalAvatarUrl, updateTime: db.serverDate() },
        });
      } catch (e) {
        await db.collection(COLLECTIONS.USERS).add({ data: userData });
      }

      app.globalData.userInfo = { ...profile, avatarUrl: finalAvatarUrl };
      wx.setStorageSync('userInfo', app.globalData.userInfo);

      wx.hideLoading();
      wx.showToast({ title: '保存成功', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (err) {
      console.error('保存失败:', err);
      showError('保存失败');
    } finally {
      this.setData({ submitting: false });
    }
  },

  // 保存家养猫
  async onSaveCat() {
    const { catForm } = this.data;
    if (!catForm.name.trim()) {
      showError('请输入猫咪名字');
      return;
    }

    this.setData({ submitting: true });
    wx.showLoading({ title: '保存中...', mask: true });

    try {
      let uploadedPhotos = [];
      if (catForm.photos.length > 0) {
        uploadedPhotos = await uploadImages(
          catForm.photos.map(p => ({ tempFilePath: p })),
          'home-cats'
        );
      }

      await query.add(COLLECTIONS.HOME_CATS, {
        ...catForm,
        photos: uploadedPhotos,
        ownerId: app.globalData.openid,
      });

      wx.hideLoading();
      wx.showToast({ title: '添加成功 🐾', icon: 'success' });
      setTimeout(() => wx.navigateBack(), 1200);
    } catch (err) {
      console.error('保存失败:', err);
      showError('保存失败');
    } finally {
      this.setData({ submitting: false });
    }
  },
});
