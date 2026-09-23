/**
 * 登录云函数 - 获取 openid 并自动创建/更新用户记录
 */
const cloud = require('wx-server-sdk');
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });
const db = cloud.database();
const _ = db.command;

exports.main = async (event, context) => {
  const { OPENID } = cloud.getWXContext();

  try {
    // 查找或创建用户
    const { data: existingUsers } = await db.collection('users')
      .where({ _id: OPENID })
      .get();

    if (existingUsers.length > 0) {
      return {
        openid: OPENID,
        userInfo: existingUsers[0],
        isNew: false,
      };
    }

    // 新用户，创建记录
    await db.collection('users').add({
      data: {
        _id: OPENID,
        _openid: OPENID,
        nickName: '',
        bio: '',
        hobbies: '',
        catPreference: '',
        avatarUrl: '',
        createTime: db.serverDate(),
        updateTime: db.serverDate(),
      },
    });

    return {
      openid: OPENID,
      userInfo: {
        _id: OPENID,
        nickName: '',
        avatarUrl: '',
      },
      isNew: true,
    };
  } catch (err) {
    console.error('登录云函数错误:', err);
    return { error: err.message };
  }
};
