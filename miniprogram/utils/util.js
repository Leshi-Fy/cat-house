/**
 * 工具函数集
 */

/**
 * 格式化日期
 * @param {Date|string|number} date 
 * @param {string} fmt 格式模板，默认 'YYYY-MM-DD HH:mm'
 */
function formatDate(date, fmt = 'YYYY-MM-DD HH:mm') {
  if (!date) return '';
  const d = new Date(date);
  const map = {
    'YYYY': d.getFullYear(),
    'MM': String(d.getMonth() + 1).padStart(2, '0'),
    'DD': String(d.getDate()).padStart(2, '0'),
    'HH': String(d.getHours()).padStart(2, '0'),
    'mm': String(d.getMinutes()).padStart(2, '0'),
    'ss': String(d.getSeconds()).padStart(2, '0'),
  };
  let result = fmt;
  for (const [key, val] of Object.entries(map)) {
    result = result.replace(key, val);
  }
  return result;
}

/**
 * 相对时间（几分钟前、几天前）
 */
function timeAgo(date) {
  if (!date) return '';
  const now = new Date();
  const d = new Date(date);
  const diff = (now - d) / 1000;

  if (diff < 60) return '刚刚';
  if (diff < 3600) return `${Math.floor(diff / 60)}分钟前`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}小时前`;
  if (diff < 2592000) return `${Math.floor(diff / 86400)}天前`;
  return formatDate(date, 'YYYY-MM-DD');
}

/**
 * 格式化金额（分 → 元）
 */
function formatMoney(fen) {
  if (fen === null || fen === undefined) return '0.00';
  return (fen / 100).toFixed(2);
}

/**
 * 计算两点距离（米）
 */
function getDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng / 2) * Math.sin(dLng / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * 友好距离显示
 */
function formatDistance(meters) {
  if (meters < 1000) return `${meters}m`;
  return `${(meters / 1000).toFixed(1)}km`;
}

/**
 * 显示加载提示
 */
function showLoading(title = '加载中...') {
  wx.showLoading({ title, mask: true });
}

/**
 * 隐藏加载提示
 */
function hideLoading() {
  wx.hideLoading();
}

/**
 * 显示错误提示
 */
function showError(msg = '操作失败，请重试') {
  wx.showToast({ title: msg, icon: 'none', duration: 2000 });
}

/**
 * Promise 化 wx.chooseImage
 */
function chooseImage(count = 9, sizeType = ['compressed'], sourceType = ['album', 'camera']) {
  return new Promise((resolve, reject) => {
    wx.chooseMedia({
      count,
      mediaType: ['image'],
      sizeType,
      sourceType,
      success: resolve,
      fail: reject,
    });
  });
}

/**
 * 上传图片到云存储
 * @param {string} filePath 本地临时路径
 * @param {string} cloudPath 云存储路径
 */
function uploadImage(filePath, cloudPath) {
  return new Promise((resolve, reject) => {
    wx.cloud.uploadFile({
      cloudPath,
      filePath,
      success: resolve,
      fail: reject,
    });
  });
}

/**
 * 批量上传图片
 */
async function uploadImages(tempFiles, dir = 'images') {
  const results = [];
  for (const file of tempFiles) {
    const ext = file.tempFilePath.split('.').pop();
    const cloudPath = `${dir}/${Date.now()}-${Math.random().toString(36).substr(2, 6)}.${ext}`;
    try {
      const res = await uploadImage(file.tempFilePath, cloudPath);
      results.push(res.fileID);
    } catch (err) {
      console.error('图片上传失败:', err);
    }
  }
  return results;
}

/**
 * 生成唯一 ID
 */
function generateId() {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * 实时计算流浪猫年龄
 * 
 * 逻辑：
 *   displayMonths = ageAtCreate（月）+ floor((now - createTime) / 月)
 *   已去世的猫：直接显示 ageAtCreate 对应的年龄，不叠加时间
 * 
 * @param {number} ageAtCreate  创建时登记的年龄（月数，可以是小数，如 0.5 = 半个月）
 * @param {Date|string|number} createTime  档案创建时间
 * @param {boolean} isDeceased  是否已去世
 * @returns {string} 友好文案，如 "约2岁3个月"，无数据时返回 ''
 */
function calcCatAge(ageAtCreate, createTime, isDeceased) {
  // ageAtCreate 未填（undefined/null/''）时直接返回空
  if (ageAtCreate === undefined || ageAtCreate === null || ageAtCreate === '') return '';

  const baseMonths = Number(ageAtCreate);
  if (isNaN(baseMonths) || baseMonths < 0) return '';

  let totalMonths = baseMonths;

  if (!isDeceased && createTime) {
    const ct = new Date(createTime);
    if (!isNaN(ct.getTime())) {
      const now = new Date();
      const elapsedMonths = Math.floor((now - ct) / (1000 * 60 * 60 * 24 * 30.5));
      if (elapsedMonths > 0) totalMonths += elapsedMonths;
    }
  }

  totalMonths = Math.round(totalMonths);

  if (totalMonths < 1) return '不足1个月';
  if (totalMonths < 12) return `约${totalMonths}个月`;
  const years = Math.floor(totalMonths / 12);
  const rem = totalMonths % 12;
  if (rem === 0) return `约${years}岁`;
  return `约${years}岁${rem}个月`;
}

/**
 * 将用户输入的年龄文本（如 "1岁3个月" / "6个月" / "2岁"）解析为月数
 * 也支持直接输入纯数字（视为月数）
 * 返回 null 表示解析失败
 */
function parseAgeToMonths(input) {
  if (!input) return null;
  const str = String(input).trim();
  // 纯数字：直接视为月数
  if (/^\d+(\.\d+)?$/.test(str)) return parseFloat(str);

  let months = 0;
  let matched = false;

  // 匹配 X岁Y个月 / X岁Y月
  const fullMatch = str.match(/(\d+)\s*岁\s*(\d+)\s*[个]?月/);
  if (fullMatch) {
    months = parseInt(fullMatch[1]) * 12 + parseInt(fullMatch[2]);
    matched = true;
  }
  // 匹配 X岁（无月）
  if (!matched) {
    const yearOnly = str.match(/^(\d+)\s*岁$/);
    if (yearOnly) {
      months = parseInt(yearOnly[1]) * 12;
      matched = true;
    }
  }
  // 匹配 X个月 / X月
  if (!matched) {
    const monthOnly = str.match(/^(\d+)\s*[个]?月$/);
    if (monthOnly) {
      months = parseInt(monthOnly[1]);
      matched = true;
    }
  }

  return matched ? months : null;
}

module.exports = {
  formatDate,
  timeAgo,
  formatMoney,
  getDistance,
  formatDistance,
  showLoading,
  hideLoading,
  showError,
  chooseImage,
  uploadImage,
  uploadImages,
  generateId,
  calcCatAge,
  parseAgeToMonths,
};
