# 🐱 猫屋 - 流浪猫管理和救助公益社区小程序

> 让每只流浪猫都被看见、被关爱

## 项目简介

「猫屋」是一个专注于流浪猫管理和救助的微信小程序，采用探探式卡片浏览体验，支持流浪猫档案创建、重复合并、众筹救助等核心功能。

## 技术栈

| 层面 | 方案 |
|------|------|
| 前端 | 微信原生小程序（WXML/WXSS/JS） |
| 后端 | 微信云开发（Serverless） |
| 数据库 | 云数据库（NoSQL，6个集合） |
| 文件存储 | 云存储（猫咪照片、发票等） |
| 地图 | 腾讯地图小程序 SDK |
| 支付 | 微信支付（接口已预留） |

## 项目结构

```
cat-house/
├── project.config.json          # 项目配置（需填入你的 AppID）
├── miniprogram/                 # 小程序前端
│   ├── app.js                   # 全局入口（云开发初始化、登录、定位）
│   ├── app.json                 # 全局配置（页面路由、tabBar、权限）
│   ├── app.wxss                 # 全局样式（设计变量、通用组件）
│   ├── sitemap.json             # 微信搜索配置
│   ├── pages/
│   │   ├── index/               # 猫屋首页（探探式卡片浏览）
│   │   ├── community/           # 社区页（众筹列表）
│   │   ├── cat/                 # 猫咪相关（分包）
│   │   │   ├── explore/         # 探索页（全部猫咪列表）
│   │   │   ├── create/          # 创建流浪猫档案
│   │   │   └── detail/          # 猫咪详情（照片轮播、合并、众筹入口）
│   │   ├── crowd/               # 众筹相关（分包）
│   │   │   ├── detail/          # 众筹详情
│   │   │   ├── create/          # 发起众筹
│   │   │   ├── donate/          # 参与捐款
│   │   │   └── receipt/         # 申请报销
│   │   └── user/                # 个人中心（分包）
│   │       ├── profile/         # 个人中心主页
│   │       ├── my-cats/         # 我的家养猫
│   │       ├── my-strays/       # 我创建的流浪猫
│   │       ├── my-crowd/        # 我参与/发起的众筹
│   │       └── edit-profile/    # 编辑资料 / 添加家养猫
│   ├── components/              # 公共组件
│   │   ├── cat-card/            # 猫咪卡片
│   │   ├── crowd-card/          # 众筹卡片
│   │   ├── paw-loading/         # 猫爪加载动画
│   │   └── empty-state/         # 空状态
│   ├── utils/
│   │   ├── util.js              # 工具函数（日期、距离、图片上传）
│   │   ├── database.js          # 数据库操作封装
│   │   ├── config.js            # 业务常量和配置
│   │   └── db-init.js           # 数据库初始化指南
│   ├── images/                  # 静态图片
│   └── icons/                   # TabBar 图标（需自行添加）
└── cloudfunctions/              # 云函数
    ├── login/                   # 用户登录（自动创建用户记录）
    ├── cat-operations/          # 流浪猫档案操作
    ├── crowd-operations/        # 众筹操作（创建、报销）
    ├── merge-operations/        # 合并操作（申请、审批、照片合并）
    └── payment-operations/      # 支付操作（演示模式 + 微信支付预留）
```

## 数据库设计（6个集合）

| 集合名 | 说明 | 关键字段 |
|--------|------|---------|
| `users` | 用户信息 | nickName, bio, avatarUrl, hobbies, catPreference |
| `stray_cats` | 流浪猫档案 | name, photos[], location(GeoPoint), healthStatus, sterilized, mergeChain[], aliases[], status |
| `home_cats` | 家养猫信息 | name, breed, age, gender, personality, photos[], ownerId |
| `crowdfundings` | 众筹项目 | catId, crowdType, targetAmount, raisedAmount, status, receiptStatus, deadline |
| `donations` | 捐款记录 | crowdId, donorId, amount, paymentMethod, paymentStatus |
| `merge_requests` | 合并申请 | fromCatId, toCatId, status, note |

## 快速部署

### 1. 环境准备

- 注册微信小程序账号，获取 **AppID**
- 下载 [微信开发者工具](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html)
- 开通云开发（免费额度足够初期使用）

### 2. 导入项目

1. 打开微信开发者工具
2. 选择「导入项目」
3. 目录选择 `cat-house` 文件夹
4. 填入你的 AppID（在 `project.config.json` 中修改）

### 3. 开通云开发

1. 点击开发者工具顶部「云开发」按钮
2. 创建云开发环境（建议选上海地域，延迟较低）
3. 记录环境 ID

### 4. 创建数据库集合

在「云开发控制台 > 数据库」中创建以下 6 个集合：

```
users
stray_cats
home_cats
crowdfundings
donations
merge_requests
```

**重要索引**：在 `stray_cats` 集合中添加地理位置索引：
- 索引字段：`location`
- 索引类型：`2dsphere`

### 5. 部署云函数

右键点击每个云函数文件夹 → 「上传并部署：云端安装依赖」：
- `login`
- `cat-operations`
- `crowd-operations`
- `merge-operations`
- `payment-operations`

### 6. 添加 TabBar 图标

在 `miniprogram/icons/` 目录下放置以下 6 个图标文件（81×81px）：

| 文件名 | 说明 |
|--------|------|
| `tab-cat.png` | 猫屋 tab 未选中 |
| `tab-cat-active.png` | 猫屋 tab 选中 |
| `tab-community.png` | 社区 tab 未选中 |
| `tab-community-active.png` | 社区 tab 选中 |
| `tab-user.png` | 我的 tab 未选中 |
| `tab-user-active.png` | 我的 tab 选中 |

> 图标推荐使用橙白色系，与整体风格统一。

### 7. 配置权限

在 `app.json` 中已声明以下权限：
- `scope.userLocation` - 获取用户位置（附近猫咪 + 活动区域标注）

### 8. 本地预览

在微信开发者工具中点击「编译」即可预览。

## 核心功能说明

### 探探式卡片浏览
- 首页加载附近流浪猫，卡片堆叠展示
- 左滑跳过，右滑查看详情
- 空状态引导创建第一只流浪猫档案

### 流浪猫档案
- 支持多张照片、外貌描述、绝育/健康状态
- 腾讯地图标注活动区域，可拖拽定位、设置半径
- 位置信息支持附近查询（需 2dsphere 索引）

### 重复合并
- 发现疑似同一只猫可申请合并
- 合并审核通过后：
  - 保留创建时间较早的档案为主档
  - 较晚档案名字自动变为主档别名
  - 双方照片全部合并
  - 记录完整合并链

### 众筹系统
- 支持绝育/食物/医疗/其他 4 种众筹类型
- 进度条实时显示筹款进度
- 发起人可上传发票申请报销
- 支付接口已预留（当前为演示模式）

## 设计规范

| 属性 | 值 |
|------|-----|
| 主色 | `#FF8C42`（暖橙色） |
| 背景色 | `#FFF8F0`（奶白色） |
| 圆角 | 小 12rpx / 中 20rpx / 大 32rpx |
| 卡片阴影 | `0 4rpx 16rpx rgba(255, 140, 66, 0.08)` |
| 字体 | 系统字体栈（PingFang SC / Microsoft YaHei） |

## UI 风格要素

- 🐾 暖橙色 + 奶白色，温暖可爱
- 🐾 圆角卡片，柔和阴影
- 🐾 猫爪装饰元素（加载动画、空状态）
- 🐾 渐变按钮，交互反馈（按压缩放）

## 后续迭代方向

- [ ] 接入微信支付（替换演示模式）
- [ ] 管理员后台（合并审核、报销审核）
- [ ] 消息通知（审核结果、众筹进展）
- [ ] 猫咪状态更新推送（目击打卡）
- [ ] 数据统计面板（救助数量、筹款总额）
- [ ] 社区互动（评论、点赞）
- [ ] 签到打卡功能
- [ ] 短视频/直播救助记录

## 许可

MIT License
