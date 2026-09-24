-- ============================================================
-- 回填历史互动为消息通知（幂等，可重复执行）
-- ============================================================
-- 背景：早期版本存在两处过滤，导致消息中心看不到「改动之前」已发生的互动：
--   1) NotifyService 会跳过 recipient == sender（自己对自己的点赞 / 评论）
--   2) 捐款通知只在「捐款人不是众筹发起人」时才生成
-- 因此 feed_likes / feed_comments / crowd_likes / crowd_comments / donations
-- 里已有的历史数据，在 notifications 表中没有对应记录。
--
-- 本脚本把这些历史互动反向补成通知，收件人 = 内容作者：
--   feed_likes  / feed_comments  -> feeds.author_id
--   crowd_likes / crowd_comments -> crowdfundings.initiator_id
--   donations                    -> crowdfundings.initiator_id
--
-- 说明：
--   - 历史消息一律标记为已读（is_read = 1），避免铃铛角标被历史数据刷爆。
--     若希望它们显示为未读，把下面各段的 1 改成 0 再执行即可（重复执行不会再插入）。
--   - 用 LEFT JOIN ... WHERE n.id IS NULL 去重，重复执行不会产生重复消息。
--   - create_time 取原始互动时间，保证消息中心按真实时间倒序排列。
-- ============================================================

-- 1) 历史点赞（动态）
INSERT INTO notifications (id, recipient_id, sender_id, sender_name, sender_avatar,
                           type, feed_id, crowd_id, feed_content, comment_content, amount, is_read, create_time)
SELECT UUID(), f.author_id, fl.user_id,
       COALESCE(u.nick_name, '匿名用户'), COALESCE(u.avatar_url, ''),
       'like', fl.feed_id, NULL,
       LEFT(COALESCE(f.content, ''), 50), NULL, 0, 1, fl.create_time
FROM feed_likes fl
JOIN feeds f ON f.id = fl.feed_id
LEFT JOIN users u ON u.id = fl.user_id
LEFT JOIN notifications n ON n.recipient_id = f.author_id
                          AND n.sender_id = fl.user_id
                          AND n.type = 'like'
                          AND n.feed_id = fl.feed_id
WHERE f.author_id IS NOT NULL AND n.id IS NULL;

-- 2) 历史评论（动态）
INSERT INTO notifications (id, recipient_id, sender_id, sender_name, sender_avatar,
                           type, feed_id, crowd_id, feed_content, comment_content, amount, is_read, create_time)
SELECT UUID(), f.author_id, fc.author_id,
       COALESCE(fc.author_name, u.nick_name, '匿名用户'), COALESCE(fc.author_avatar, u.avatar_url, ''),
       'comment', fc.feed_id, NULL,
       LEFT(COALESCE(f.content, ''), 50), fc.content, 0, 1, fc.create_time
FROM feed_comments fc
JOIN feeds f ON f.id = fc.feed_id
LEFT JOIN users u ON u.id = fc.author_id
LEFT JOIN notifications n ON n.recipient_id = f.author_id
                          AND n.sender_id = fc.author_id
                          AND n.type = 'comment'
                          AND n.feed_id = fc.feed_id
                          AND n.comment_content <=> fc.content
WHERE f.author_id IS NOT NULL AND n.id IS NULL;

-- 3) 历史点赞（众筹）
INSERT INTO notifications (id, recipient_id, sender_id, sender_name, sender_avatar,
                           type, feed_id, crowd_id, feed_content, comment_content, amount, is_read, create_time)
SELECT UUID(), c.initiator_id, cl.user_id,
       COALESCE(u.nick_name, '匿名用户'), COALESCE(u.avatar_url, ''),
       'like', NULL, cl.crowd_id,
       LEFT(CONCAT_WS(' · ', NULLIF(c.cat_name, ''), NULLIF(c.description, '')), 50), NULL, 0, 1, cl.create_time
FROM crowd_likes cl
JOIN crowdfundings c ON c.id = cl.crowd_id
LEFT JOIN users u ON u.id = cl.user_id
LEFT JOIN notifications n ON n.recipient_id = c.initiator_id
                          AND n.sender_id = cl.user_id
                          AND n.type = 'like'
                          AND n.crowd_id = cl.crowd_id
WHERE c.initiator_id IS NOT NULL AND n.id IS NULL;

-- 4) 历史评论（众筹）
INSERT INTO notifications (id, recipient_id, sender_id, sender_name, sender_avatar,
                           type, feed_id, crowd_id, feed_content, comment_content, amount, is_read, create_time)
SELECT UUID(), c.initiator_id, cc.author_id,
       COALESCE(cc.author_name, u.nick_name, '匿名用户'), COALESCE(cc.author_avatar, u.avatar_url, ''),
       'comment', NULL, cc.crowd_id,
       LEFT(CONCAT_WS(' · ', NULLIF(c.cat_name, ''), NULLIF(c.description, '')), 50), cc.content, 0, 1, cc.create_time
FROM crowd_comments cc
JOIN crowdfundings c ON c.id = cc.crowd_id
LEFT JOIN users u ON u.id = cc.author_id
LEFT JOIN notifications n ON n.recipient_id = c.initiator_id
                          AND n.sender_id = cc.author_id
                          AND n.type = 'comment'
                          AND n.crowd_id = cc.crowd_id
                          AND n.comment_content <=> cc.content
WHERE c.initiator_id IS NOT NULL AND n.id IS NULL;

-- 5) 历史捐款
INSERT INTO notifications (id, recipient_id, sender_id, sender_name, sender_avatar,
                           type, feed_id, crowd_id, feed_content, comment_content, amount, is_read, create_time)
SELECT UUID(), c.initiator_id, d.donor_id,
       COALESCE(d.donor_name, u.nick_name, '匿名爱心人士'), COALESCE(u.avatar_url, ''),
       'donate', NULL, d.crowd_id,
       LEFT(CONCAT_WS(' · ', NULLIF(c.cat_name, ''), NULLIF(c.description, '')), 50), NULL, d.amount, 1, d.create_time
FROM donations d
JOIN crowdfundings c ON c.id = d.crowd_id
LEFT JOIN users u ON u.id = d.donor_id
LEFT JOIN notifications n ON n.recipient_id = c.initiator_id
                          AND n.sender_id = d.donor_id
                          AND n.type = 'donate'
                          AND n.crowd_id = d.crowd_id
                          AND n.amount = d.amount
                          AND n.create_time = d.create_time
WHERE c.initiator_id IS NOT NULL AND n.id IS NULL;

-- 校验：各类型消息数量
-- SELECT type, COUNT(*) FROM notifications GROUP BY type;
