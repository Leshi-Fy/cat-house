/**
 * 云数据库初始化脚本
 * 
 * 使用方法：在小程序中调用 wx.cloud.callFunction({ name: 'login' }) 登录后，
 * 在开发者工具的云开发控制台中手动创建以下集合并添加索引。
 * 
 * 也可在云函数中运行此脚本来初始化。
 */

// ===== 需要创建的数据库集合 =====

const collections = [
  {
    name: 'users',
    description: '用户信息',
    indexes: [
      { keys: { _id: 1 }, unique: true },
    ],
    sampleData: {
      _id: 'demo_openid',
      _openid: 'demo_openid',
      nickName: '猫屋演示用户',
      bio: '爱猫人士',
      hobbies: '摄影、撸猫',
      catPreference: '橘猫、英短',
      avatarUrl: '',
      createTime: new Date(),
      updateTime: new Date(),
    },
  },
  {
    name: 'stray_cats',
    description: '流浪猫档案',
    indexes: [
      { keys: { creatorId: 1 } },
      { keys: { status: 1 } },
      { keys: { location: '2dsphere' } },  // 地理位置索引（附近查询必需）
    ],
    sampleData: {
      name: '小橘',
      description: '橘色虎斑猫，体型偏胖，性格亲人，耳朵有缺口',
      gender: 'male',
      sterilized: 'no',
      healthStatus: 'good',
      age: '1-2岁',
      photos: [],
      creatorId: 'demo_openid',
      creatorName: '猫屋演示用户',
      lastSeenTime: new Date(),
      location: null, // db.Geo.Point(longitude, latitude)
      areaRadius: 500,
      mergeChain: [],
      aliases: [],
      status: 'active',
      createTime: new Date(),
      updateTime: new Date(),
    },
  },
  {
    name: 'home_cats',
    description: '家养猫信息',
    indexes: [
      { keys: { ownerId: 1 } },
    ],
    sampleData: {
      name: '团子',
      breed: '英短蓝猫',
      age: '3岁',
      gender: 'male',
      personality: '温顺粘人',
      photos: [],
      ownerId: 'demo_openid',
      createTime: new Date(),
      updateTime: new Date(),
    },
  },
  {
    name: 'crowdfundings',
    description: '众筹项目',
    indexes: [
      { keys: { initiatorId: 1 } },
      { keys: { status: 1 } },
      { keys: { catId: 1 } },
    ],
    sampleData: {
      catId: 'demo_cat_id',
      catName: '小橘',
      catPhoto: '',
      crowdType: 'sterilize',
      description: '为小橘筹集绝育手术费用',
      targetAmount: 50000, // 500元，单位：分
      raisedAmount: 0,
      status: 'ongoing',
      deadline: new Date(Date.now() + 30 * 24 * 3600 * 1000), // 30天后
      initiatorId: 'demo_openid',
      initiatorName: '猫屋演示用户',
      photos: [],
      receiptStatus: 'none',
      receipts: [],
      createTime: new Date(),
      updateTime: new Date(),
    },
  },
  {
    name: 'donations',
    description: '捐款记录',
    indexes: [
      { keys: { donorId: 1 } },
      { keys: { crowdId: 1 } },
    ],
    sampleData: {
      crowdId: 'demo_crowd_id',
      donorId: 'demo_openid',
      donorName: '爱心人士',
      amount: 1000, // 10元，单位：分
      paymentMethod: 'demo',
      paymentStatus: 'paid',
      createTime: new Date(),
    },
  },
  {
    name: 'merge_requests',
    description: '档案合并申请',
    indexes: [
      { keys: { status: 1 } },
      { keys: { fromUserId: 1 } },
      { keys: { toUserId: 1 } },
    ],
    sampleData: {
      fromCatId: 'cat_a_id',
      fromCatName: '小橘',
      fromUserId: 'user_a_openid',
      toCatId: 'cat_b_id',
      toCatName: '大橘',
      toUserId: 'user_b_openid',
      applicantId: 'user_a_openid',
      status: 'pending',
      note: '疑似同一只猫，毛色和活动区域相同',
      createTime: new Date(),
    },
  },
];

console.log('===== 猫屋数据库初始化指南 =====');
console.log('\n请在微信开发者工具「云开发控制台」中手动创建以下 6 个集合：\n');
collections.forEach(c => {
  console.log(`集合: ${c.name}`);
  console.log(`  描述: ${c.description}`);
  if (c.indexes.length > 0) {
    console.log(`  索引:`);
    c.indexes.forEach(idx => {
      console.log(`    - ${JSON.stringify(idx.keys)}${idx.unique ? ' (唯一)' : ''}`);
    });
  }
  console.log('');
});

console.log('\n===== 关键索引说明 =====');
console.log('stray_cats 集合的 location 索引（2dsphere）对附近查询功能至关重要。');
console.log('创建方式：云开发控制台 > 数据库 > stray_cats > 索引管理 > 添加索引');
console.log('  索引字段: location');
console.log('  索引类型: 2dsphere (地理位置)');
