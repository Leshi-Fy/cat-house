-- ============================================================
-- 猫屋小程序 · MySQL 8 数据库 Schema
-- 执行方式：在 MySQL 客户端 source 本文件，或复制粘贴到 Navicat / DBeaver 执行。
-- 前置：先建库  CREATE DATABASE cathouse CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
-- 说明：
--   1. 列名 snake_case；服务层返回时转为前端 camelCase（含 _id）。
--   2. 定位字段 latitude / longitude（DOUBLE），距离在服务端用 haversine 计算。
--   3. jsonb 字段（photos / merge_chain / aliases / receipt_records / cat_info）用 LONGTEXT 存 JSON 字符串。
--   4. 与 Postgres 版等价，仅类型适配 MySQL。
-- ============================================================

-- 用户资料（id = openid）
CREATE TABLE IF NOT EXISTS users (
  id            VARCHAR(64) PRIMARY KEY,
  nick_name     VARCHAR(255) DEFAULT '',
  bio           TEXT,
  hobbies       VARCHAR(255) DEFAULT '',
  cat_preference VARCHAR(255) DEFAULT '',
  avatar_url    VARCHAR(512) DEFAULT '',
  create_time   DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- 流浪猫档案
CREATE TABLE IF NOT EXISTS stray_cats (
  id            VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(255),
  description   TEXT,
  gender        VARCHAR(32),
  sterilized    VARCHAR(32),
  health_status VARCHAR(64),
  age_at_create INT,
  photos        LONGTEXT,
  creator_id    VARCHAR(64),
  creator_name  VARCHAR(128),
  last_seen_time DATETIME,
  latitude      DOUBLE,
  longitude     DOUBLE,
  area_radius   INT DEFAULT 500,
  merge_chain   LONGTEXT,
  aliases       LONGTEXT,
  status        VARCHAR(32) DEFAULT 'active',
  merged_into   VARCHAR(36),
  create_time   DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_stray_cats_status ON stray_cats(status);
CREATE INDEX idx_stray_cats_creator ON stray_cats(creator_id);
CREATE INDEX idx_stray_cats_ctime ON stray_cats(create_time);
CREATE INDEX idx_stray_cats_loc ON stray_cats(latitude, longitude);

-- 家养猫信息
CREATE TABLE IF NOT EXISTS home_cats (
  id            VARCHAR(36) PRIMARY KEY,
  name          VARCHAR(255),
  breed         VARCHAR(128),
  age           VARCHAR(64),
  gender        VARCHAR(32),
  personality   VARCHAR(255),
  photos        LONGTEXT,
  owner_id      VARCHAR(64),
  create_time   DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_home_cats_owner ON home_cats(owner_id);

-- 众筹项目
CREATE TABLE IF NOT EXISTS crowdfundings (
  id              VARCHAR(36) PRIMARY KEY,
  cat_id          VARCHAR(64),
  cat_name        VARCHAR(255),
  cat_photo       VARCHAR(512),
  crowd_type      VARCHAR(64),
  description     TEXT,
  target_amount   INT DEFAULT 0,
  raised_amount   INT DEFAULT 0,
  status          VARCHAR(32) DEFAULT 'ongoing',
  deadline        DATETIME,
  initiator_id    VARCHAR(64),
  initiator_name  VARCHAR(128),
  photos          LONGTEXT,
  receipt_status  VARCHAR(32) DEFAULT 'none',
  receipt_records LONGTEXT,
  like_count      INT DEFAULT 0,
  comment_count   INT DEFAULT 0,
  create_time     DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time     DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_crowd_initiator ON crowdfundings(initiator_id);
CREATE INDEX idx_crowd_status ON crowdfundings(status);
CREATE INDEX idx_crowd_cat ON crowdfundings(cat_id);

-- 捐款记录
CREATE TABLE IF NOT EXISTS donations (
  id              VARCHAR(36) PRIMARY KEY,
  crowd_id        VARCHAR(64),
  donor_id        VARCHAR(64),
  donor_name      VARCHAR(128),
  amount          INT DEFAULT 0,
  payment_method  VARCHAR(32),
  payment_status  VARCHAR(32) DEFAULT 'paid',
  out_trade_no    VARCHAR(64),
  create_time     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_donations_crowd ON donations(crowd_id);
CREATE INDEX idx_donations_donor ON donations(donor_id);

-- 档案合并申请
CREATE TABLE IF NOT EXISTS merge_requests (
  id              VARCHAR(36) PRIMARY KEY,
  from_cat_id     VARCHAR(36),
  from_cat_name   VARCHAR(255),
  from_user_id    VARCHAR(64),
  to_cat_id       VARCHAR(36),
  to_cat_name     VARCHAR(255),
  to_user_id      VARCHAR(64),
  applicant_id    VARCHAR(64),
  status          VARCHAR(32) DEFAULT 'pending',
  note            VARCHAR(512),
  approved_by_id  VARCHAR(64),
  approved_time   DATETIME,
  rejected_by_id  VARCHAR(64),
  reject_reason   VARCHAR(512),
  create_time     DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_merge_status ON merge_requests(status);
CREATE INDEX idx_merge_users ON merge_requests(from_user_id, to_user_id);

-- 社区动态
CREATE TABLE IF NOT EXISTS feeds (
  id            VARCHAR(36) PRIMARY KEY,
  content       TEXT,
  photos        LONGTEXT,
  author_id     VARCHAR(64),
  author_name   VARCHAR(128),
  author_avatar VARCHAR(512),
  cat_id        VARCHAR(64),
  cat_info      LONGTEXT,
  like_count    INT DEFAULT 0,
  comment_count INT DEFAULT 0,
  create_time   DATETIME DEFAULT CURRENT_TIMESTAMP,
  update_time   DATETIME DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
CREATE INDEX idx_feeds_author ON feeds(author_id);
CREATE INDEX idx_feeds_ctime ON feeds(create_time);

-- 点赞记录（唯一约束防止重复点赞）
CREATE TABLE IF NOT EXISTS feed_likes (
  id          VARCHAR(36) PRIMARY KEY,
  feed_id     VARCHAR(36),
  user_id     VARCHAR(64),
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_feed_user (feed_id, user_id)
);
CREATE INDEX idx_likes_feed ON feed_likes(feed_id);
CREATE INDEX idx_likes_user ON feed_likes(user_id);

-- 评论（parent_id 为 null 表示一级评论）
CREATE TABLE IF NOT EXISTS feed_comments (
  id          VARCHAR(36) PRIMARY KEY,
  feed_id     VARCHAR(36),
  content     TEXT,
  author_id   VARCHAR(64),
  author_name VARCHAR(128),
  author_avatar VARCHAR(512),
  parent_id   VARCHAR(36),
  like_count  INT DEFAULT 0,
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_comments_feed ON feed_comments(feed_id);
CREATE INDEX idx_comments_parent ON feed_comments(parent_id);

-- 众筹点赞记录（唯一约束防止重复点赞）
CREATE TABLE IF NOT EXISTS crowd_likes (
  id          VARCHAR(36) PRIMARY KEY,
  crowd_id    VARCHAR(36),
  user_id     VARCHAR(64),
  create_time DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_crowd_user (crowd_id, user_id)
);
CREATE INDEX idx_crowd_likes_crowd ON crowd_likes(crowd_id);
CREATE INDEX idx_crowd_likes_user ON crowd_likes(user_id);

-- 众筹评论（parent_id 为 null 表示一级评论）
CREATE TABLE IF NOT EXISTS crowd_comments (
  id            VARCHAR(36) PRIMARY KEY,
  crowd_id      VARCHAR(36),
  content       TEXT,
  author_id     VARCHAR(64),
  author_name   VARCHAR(128),
  author_avatar VARCHAR(512),
  parent_id     VARCHAR(36),
  like_count    INT DEFAULT 0,
  create_time   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_crowd_comments_crowd ON crowd_comments(crowd_id);
CREATE INDEX idx_crowd_comments_parent ON crowd_comments(parent_id);

-- 已有库升级（老库没有 like_count / comment_count 时执行）
-- ALTER TABLE crowdfundings ADD COLUMN like_count INT DEFAULT 0;
-- ALTER TABLE crowdfundings ADD COLUMN comment_count INT DEFAULT 0;

-- 消息通知
CREATE TABLE IF NOT EXISTS notifications (
  id            VARCHAR(36) PRIMARY KEY,
  recipient_id  VARCHAR(64),
  sender_id     VARCHAR(64),
  sender_name   VARCHAR(128),
  sender_avatar VARCHAR(512),
  type          VARCHAR(32),
  feed_id       VARCHAR(36),
  crowd_id      VARCHAR(36),
  feed_content  TEXT,
  comment_content TEXT,
  amount        INT DEFAULT 0,
  is_read       TINYINT(1) DEFAULT 0,
  create_time   DATETIME DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_notif_recipient ON notifications(recipient_id);
CREATE INDEX idx_notif_type ON notifications(recipient_id, type, is_read);
