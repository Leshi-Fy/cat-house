-- ============================================================
-- 猫屋小程序 · MemFire Cloud (Supabase 兼容) 数据库 Schema
-- 执行方式：在 MemFire 控制台 SQL 编辑器里整段执行，或 psql 执行本文件
-- 说明：
--   1. 列名统一 snake_case，后端返回时会转换为前端使用的 camelCase（含 _id）
--   2. 定位字段用 latitude / longitude（double precision），不依赖 postgis，距离在前端/Edge 端用 haversine 计算
--   3. jsonb 字段（photos / cat_info / merge_chain / aliases / receipt_records）原样存 camelCase 内容
--   4. RLS 默认关闭：鉴权由 Edge Function 的应用层逻辑完成（与原来云开发信任 openid 的模型一致）。
--      若后续需要更严格的行级安全，再开启 RLS 并配合 JWT。
-- ============================================================

-- 用户资料（_id = openid）
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  nick_name     TEXT DEFAULT '',
  bio           TEXT DEFAULT '',
  hobbies       TEXT DEFAULT '',
  cat_preference TEXT DEFAULT '',
  avatar_url    TEXT DEFAULT '',
  create_time   TIMESTAMPTZ DEFAULT now(),
  update_time   TIMESTAMPTZ DEFAULT now()
);

-- 流浪猫档案
CREATE TABLE IF NOT EXISTS stray_cats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT,
  description   TEXT,
  gender        TEXT,
  sterilized    TEXT,
  health_status TEXT,
  age_at_create INTEGER,            -- 创建时登记的年龄（月）
  photos        JSONB DEFAULT '[]'::jsonb,
  creator_id    TEXT,
  creator_name  TEXT,
  last_seen_time TIMESTAMPTZ,
  latitude      DOUBLE PRECISION,
  longitude     DOUBLE PRECISION,
  area_radius   INTEGER DEFAULT 500,
  merge_chain   JSONB DEFAULT '[]'::jsonb,
  aliases       JSONB DEFAULT '[]'::jsonb,
  status        TEXT DEFAULT 'active',   -- active | merged
  merged_into   UUID,
  create_time   TIMESTAMPTZ DEFAULT now(),
  update_time   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_stray_cats_status ON stray_cats(status);
CREATE INDEX IF NOT EXISTS idx_stray_cats_creator ON stray_cats(creator_id);
CREATE INDEX IF NOT EXISTS idx_stray_cats_create_time ON stray_cats(create_time DESC);
CREATE INDEX IF NOT EXISTS idx_stray_cats_loc ON stray_cats(latitude, longitude);

-- 家养猫信息
CREATE TABLE IF NOT EXISTS home_cats (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT,
  breed         TEXT,
  age           TEXT,
  gender        TEXT,
  personality   TEXT,
  photos        JSONB DEFAULT '[]'::jsonb,
  owner_id      TEXT,
  create_time   TIMESTAMPTZ DEFAULT now(),
  update_time   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_home_cats_owner ON home_cats(owner_id);

-- 众筹项目
CREATE TABLE IF NOT EXISTS crowdfundings (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cat_id          TEXT,
  cat_name        TEXT,
  cat_photo       TEXT,
  crowd_type      TEXT,
  description     TEXT,
  target_amount   INTEGER DEFAULT 0,   -- 单位：分
  raised_amount   INTEGER DEFAULT 0,   -- 单位：分
  status          TEXT DEFAULT 'ongoing', -- ongoing | completed
  deadline        TIMESTAMPTZ,
  initiator_id    TEXT,
  initiator_name  TEXT,
  photos          JSONB DEFAULT '[]'::jsonb,
  receipt_status  TEXT DEFAULT 'none',  -- none | pending | approved | rejected
  receipt_records JSONB DEFAULT '[]'::jsonb,
  create_time     TIMESTAMPTZ DEFAULT now(),
  update_time     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_crowd_initiator ON crowdfundings(initiator_id);
CREATE INDEX IF NOT EXISTS idx_crowd_status ON crowdfundings(status);
CREATE INDEX IF NOT EXISTS idx_crowd_cat ON crowdfundings(cat_id);

-- 捐款记录
CREATE TABLE IF NOT EXISTS donations (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  crowd_id        TEXT,
  donor_id        TEXT,
  donor_name      TEXT,
  amount          INTEGER DEFAULT 0,    -- 分
  payment_method  TEXT,
  payment_status  TEXT DEFAULT 'paid',  -- paid | pending
  out_trade_no    TEXT,
  create_time     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_donations_crowd ON donations(crowd_id);
CREATE INDEX IF NOT EXISTS idx_donations_donor ON donations(donor_id);

-- 档案合并申请
CREATE TABLE IF NOT EXISTS merge_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_cat_id     TEXT,
  from_cat_name   TEXT,
  from_user_id    TEXT,
  to_cat_id       TEXT,
  to_cat_name     TEXT,
  to_user_id      TEXT,
  applicant_id    TEXT,
  status          TEXT DEFAULT 'pending', -- pending | approved | rejected
  note            TEXT,
  approved_by_id  TEXT,
  approved_time   TIMESTAMPTZ,
  rejected_by_id  TEXT,
  reject_reason   TEXT,
  create_time     TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merge_status ON merge_requests(status);
CREATE INDEX IF NOT EXISTS idx_merge_users ON merge_requests(from_user_id, to_user_id);

-- 社区动态
CREATE TABLE IF NOT EXISTS feeds (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content       TEXT,
  photos        JSONB DEFAULT '[]'::jsonb,
  author_id     TEXT,
  author_name   TEXT,
  author_avatar TEXT,
  cat_id        TEXT,
  cat_info      JSONB,
  like_count    INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  create_time   TIMESTAMPTZ DEFAULT now(),
  update_time   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_feeds_author ON feeds(author_id);
CREATE INDEX IF NOT EXISTS idx_feeds_create_time ON feeds(create_time DESC);

-- 点赞记录（唯一约束防止重复点赞）
CREATE TABLE IF NOT EXISTS feed_likes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id     TEXT,
  user_id     TEXT,
  create_time TIMESTAMPTZ DEFAULT now(),
  UNIQUE(feed_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_likes_feed ON feed_likes(feed_id);
CREATE INDEX IF NOT EXISTS idx_likes_user ON feed_likes(user_id);

-- 评论（parent_id 为 null 表示一级评论）
CREATE TABLE IF NOT EXISTS feed_comments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feed_id     TEXT,
  content     TEXT,
  author_id   TEXT,
  author_name TEXT,
  author_avatar TEXT,
  parent_id   TEXT,
  like_count  INTEGER DEFAULT 0,
  create_time TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_comments_feed ON feed_comments(feed_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON feed_comments(parent_id);

-- 消息通知
CREATE TABLE IF NOT EXISTS notifications (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id  TEXT,
  sender_id     TEXT,
  sender_name   TEXT,
  sender_avatar TEXT,
  type          TEXT,                 -- like | comment | donate
  feed_id       TEXT,
  crowd_id      TEXT,
  feed_content  TEXT,
  comment_content TEXT,
  amount        INTEGER DEFAULT 0,
  is_read       BOOLEAN DEFAULT FALSE,
  create_time   TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id);
CREATE INDEX IF NOT EXISTS idx_notif_type ON notifications(recipient_id, type, is_read);
