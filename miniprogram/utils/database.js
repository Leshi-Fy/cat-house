/**
 * 云数据库操作封装
 */

const db = wx.cloud.database();
const _ = db.command;

// 集合名称常量
const COLLECTIONS = {
  USERS: 'users',
  STRAY_CATS: 'stray_cats',
  HOME_CATS: 'home_cats',
  CROWDFUNDINGS: 'crowdfundings',
  DONATIONS: 'donations',
  MERGE_REQUESTS: 'merge_requests',
};

/**
 * 通用查询方法
 */
const query = {
  /**
   * 获取单条记录
   */
  async getById(collection, id) {
    const { data } = await db.collection(collection).doc(id).get();
    return data;
  },

  /**
   * 条件查询（单页）
   */
  async where(collection, condition, page = 1, pageSize = 10) {
    const skip = (page - 1) * pageSize;
    const { data } = await db.collection(collection)
      .where(condition)
      .orderBy('createTime', 'desc')
      .skip(skip)
      .limit(pageSize)
      .get();
    return data;
  },

  /**
   * 查询总数
   */
  async count(collection, condition = {}) {
    const { total } = await db.collection(collection).where(condition).count();
    return total;
  },

  /**
   * 新增记录
   */
  async add(collection, data) {
    data.createTime = db.serverDate();
    data.updateTime = db.serverDate();
    const { _id } = await db.collection(collection).add({ data });
    return _id;
  },

  /**
   * 更新记录
   */
  async update(collection, id, data) {
    data.updateTime = db.serverDate();
    await db.collection(collection).doc(id).update({ data });
    return true;
  },

  /**
   * 删除记录
   */
  async remove(collection, id) {
    await db.collection(collection).doc(id).remove();
    return true;
  },

  /**
   * 地理位置附近查询（需要索引）
   * @param {string} collection 集合名
   * @param {number} latitude 纬度
   * @param {number} longitude 经度
   * @param {number} radius 半径（米）
   * @param {number} limit 数量限制
   */
  async near(collection, latitude, longitude, radius = 5000, limit = 20) {
    const { data } = await db.collection(collection)
      .where({
        location: db.Geo.Point(longitude, latitude),
      })
      .limit(limit)
      .get();
    return data;
  },
};

module.exports = {
  db,
  _,
  COLLECTIONS,
  query,
};
