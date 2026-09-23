/**
 * 数据库初始化云函数
 * 创建所有需要的集合
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();

const COLLECTIONS = [
  'users',
  'stray_cats',
  'home_cats',
  'crowdfundings',
  'donations',
  'merge_requests',
  'feeds',
  'feed_likes'
];

exports.main = async (event, context) => {
  const results = {};

  for (const name of COLLECTIONS) {
    try {
      // 尝试写入一条记录来自动创建集合
      const addRes = await db.collection(name).add({
        data: {
          _init: true,
          createTime: db.serverDate()
        }
      });

      // 删除初始化记录
      await db.collection(name).doc(addRes._id).remove();

      results[name] = '✅ 已创建';
    } catch (err) {
      // 如果集合已存在，会报 -502001 错误
      if (err.errCode === -502001 || err.message?.includes('already exists')) {
        results[name] = '⏭ 已存在';
      } else {
        results[name] = `❌ 失败: ${err.message || err.errCode}`;
      }
    }
  }

  return {
    success: true,
    message: '数据库初始化完成！请手动给 stray_cats 集合的 location 字段添加 2dsphere 索引。',
    results
  };
};
