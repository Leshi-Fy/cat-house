/**
 * 全局配置
 */

module.exports = {
  // 业务常量
  CAT_GENDER: {
    UNKNOWN: 'unknown',
    MALE: 'male',
    FEMALE: 'female',
  },

  STERILIZED_STATUS: {
    UNKNOWN: 'unknown',
    YES: 'yes',
    NO: 'no',
  },

  HEALTH_STATUS: {
    GOOD: 'good',
    FAIR: 'fair',
    POOR: 'poor',
    INJURED: 'injured',
  },

  CROWD_TYPES: {
    STERILIZE: 'sterilize',  // 绝育
    FOOD: 'food',            // 食物
    MEDICAL: 'medical',      // 医疗
    OTHER: 'other',          // 其他
  },

  MERGE_STATUS: {
    PENDING: 'pending',      // 待审核
    APPROVED: 'approved',    // 已通过
    REJECTED: 'rejected',    // 已拒绝
  },

  // 地图默认配置
  MAP_DEFAULT: {
    latitude: 39.9042,
    longitude: 116.4074,
    scale: 15,
    radius: 500, // 活动区域默认半径（米）
  },

  // 搜索半径
  SEARCH_RADIUS: 5000,

  // 分页
  PAGE_SIZE: 10,

  // 标签文案映射
  GENDER_TEXT: {
    unknown: '未知',
    male: '公',
    female: '母',
  },

  STERILIZED_TEXT: {
    unknown: '未知',
    yes: '已绝育',
    no: '未绝育',
  },

  HEALTH_TEXT: {
    good: '健康',
    fair: '一般',
    poor: '较差',
    injured: '受伤',
    sick: '生病',
    deceased: '已去世',
  },

  CROWD_TYPE_TEXT: {
    sterilize: '绝育',
    food: '食物',
    medical: '医疗',
    other: '其他',
  },

  MERGE_STATUS_TEXT: {
    pending: '待审核',
    approved: '已通过',
    rejected: '已拒绝',
  },

  RECEIPT_STATUS_TEXT: {
    none: '未申请',
    pending: '审核中',
    approved: '已通过',
    rejected: '已驳回',
  },
};
