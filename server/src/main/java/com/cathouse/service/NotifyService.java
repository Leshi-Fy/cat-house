package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.Crowdfunding;
import com.cathouse.entity.Feed;
import com.cathouse.entity.Notification;
import com.cathouse.mapper.CrowdfundingMapper;
import com.cathouse.mapper.FeedMapper;
import com.cathouse.mapper.NotificationMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 消息通知（被点赞 / 评论 / 捐款 时生成）。
 * 内部共享服务，其他 Service 注入后调用 createNotification。
 *
 * <p>设计要点：
 * <ul>
 *   <li><b>自己对自己也记录</b>：发帖人本人点赞 / 评论自己的动态同样会生成通知，
 *       消息中心可以看到「自己发出的互动」。早期版本会跳过，导致单账号调试时消息页永远为空。</li>
 *   <li><b>点赞是状态不是事件</b>：同一个人对同一目标重复点赞只保留一条通知；
 *       取消点赞时把对应通知一并删掉（见 {@link #removeLikeNotification}）。</li>
 *   <li><b>读取时关联内容</b>：list() 会顺带查出目标动态 / 众筹的摘要与首图，
 *       供消息中心展示并跳转；目标已被删除时 targetExists=false，前端只提示不跳转。</li>
 * </ul>
 */
@Service
public class NotifyService {

    /** 消息里引用的内容摘要最大长度。 */
    private static final int TITLE_MAX = 50;

    private final NotificationMapper notificationMapper;
    private final FeedMapper feedMapper;
    private final CrowdfundingMapper crowdfundingMapper;

    public NotifyService(NotificationMapper notificationMapper, FeedMapper feedMapper,
                         CrowdfundingMapper crowdfundingMapper) {
        this.notificationMapper = notificationMapper;
        this.feedMapper = feedMapper;
        this.crowdfundingMapper = crowdfundingMapper;
    }

    /**
     * 生成一条通知。
     *
     * <p>不再过滤 recipientId == senderId：发帖人自己点赞 / 评论自己的内容也要能在消息中心看到。
     * 仅当收件人为空时跳过。
     *
     * @param feedId        动态目标 id（动态类通知）
     * @param crowdId       众筹目标 id（众筹类通知）
     * @param feedContent   内容摘要（目标被删除后作为兜底文案保留）
     * @param commentContent 评论正文
     * @param amount        捐款金额（分）
     */
    public void createNotification(String recipientId, String senderId, String senderName, String senderAvatar,
                                   String type, String feedId, String crowdId,
                                   String feedContent, String commentContent, Integer amount) {
        if (recipientId == null || recipientId.isBlank()) return;

        // 点赞是「状态」：同一个人对同一目标只保留一条，避免 赞→取消→再赞 产生多条
        if ("like".equals(type)) {
            remove(recipientId, senderId, "like", feedId, crowdId);
        }

        Notification n = new Notification();
        n.setId(UUID.randomUUID().toString());
        n.setRecipientId(recipientId);
        n.setSenderId(senderId);
        n.setSenderName(senderName == null ? "匿名用户" : senderName);
        n.setSenderAvatar(senderAvatar == null ? "" : senderAvatar);
        n.setType(type);
        n.setFeedId(feedId);
        n.setCrowdId(crowdId);
        n.setFeedContent(feedContent == null ? "" : feedContent);
        n.setCommentContent(commentContent == null ? "" : commentContent);
        n.setAmount(amount == null ? 0 : amount);
        n.setIsRead(false);
        n.setCreateTime(LocalDateTime.now());
        notificationMapper.insert(n);
    }

    /** 取消点赞时清理对应通知：调用方传 feedId 或 crowdId 二者之一。 */
    public void removeLikeNotification(String senderId, String feedId, String crowdId) {
        if (feedId != null && !feedId.isBlank()) remove(null, senderId, "like", feedId, null);
        if (crowdId != null && !crowdId.isBlank()) remove(null, senderId, "like", null, crowdId);
    }

    private void remove(String recipientId, String senderId, String type, String feedId, String crowdId) {
        QueryWrapper<Notification> qw = new QueryWrapper<>();
        if (recipientId != null) qw.eq("recipient_id", recipientId);
        qw.eq("sender_id", senderId).eq("type", type);
        if (feedId != null) qw.eq("feed_id", feedId);
        if (crowdId != null) qw.eq("crowd_id", crowdId);
        notificationMapper.delete(qw);
    }

    /**
     * 通知列表。返回 { data: [...], total: n }，元素是「客户端形状」的 Map
     * （snake→camel、id→_id），并补充：
     * targetType（feed|crowd|none）、targetTitle、targetPhoto、targetExists、isSelf。
     */
    public Map<String, Object> list(String recipientId, String type, long page, long pageSize) {
        QueryWrapper<Notification> qw = new QueryWrapper<>();
        qw.eq("recipient_id", recipientId);
        if (type != null && !type.isBlank()) qw.eq("type", type);
        qw.orderByDesc("create_time");
        qw.last("LIMIT " + pageSize + " OFFSET " + (page * pageSize));
        List<Notification> rows = notificationMapper.selectList(qw);

        QueryWrapper<Notification> cqw = new QueryWrapper<>();
        cqw.eq("recipient_id", recipientId);
        if (type != null && !type.isBlank()) cqw.eq("type", type);
        long total = notificationMapper.selectCount(cqw);

        // 批量取目标内容（动态 / 众筹），一次性查询，避免逐条 N+1
        Set<String> feedIds = new HashSet<>();
        Set<String> crowdIds = new HashSet<>();
        for (Notification n : rows) {
            if (isNotBlank(n.getFeedId())) feedIds.add(n.getFeedId());
            if (isNotBlank(n.getCrowdId())) crowdIds.add(n.getCrowdId());
        }
        Map<String, Feed> feedMap = feedIds.isEmpty() ? Collections.emptyMap()
                : feedMapper.selectBatchIds(feedIds).stream()
                .collect(Collectors.toMap(Feed::getId, f -> f, (a, b) -> a));
        Map<String, Crowdfunding> crowdMap = crowdIds.isEmpty() ? Collections.emptyMap()
                : crowdfundingMapper.selectBatchIds(crowdIds).stream()
                .collect(Collectors.toMap(Crowdfunding::getId, c -> c, (a, b) -> a));

        List<Map<String, Object>> data = new ArrayList<>(rows.size());
        for (Notification n : rows) {
            Map<String, Object> m = FieldUtils.clientMap(n);
            if (m == null) continue;

            String targetType = "none";
            boolean exists = false;
            String title = "";
            String photo = "";

            if (isNotBlank(n.getFeedId())) {
                targetType = "feed";
                Feed f = feedMap.get(n.getFeedId());
                if (f != null) {
                    exists = true;
                    title = f.getContent() == null ? "" : f.getContent();
                    photo = firstPhoto(f.getPhotos());
                } else if (isNotBlank(n.getFeedContent())) {
                    title = n.getFeedContent();   // 动态已删除，保留写入时的历史摘要
                }
            } else if (isNotBlank(n.getCrowdId())) {
                targetType = "crowd";
                Crowdfunding c = crowdMap.get(n.getCrowdId());
                if (c != null) {
                    exists = true;
                    title = crowdTitle(c);
                    photo = firstPhoto(c.getPhotos());
                } else if (isNotBlank(n.getFeedContent())) {
                    title = n.getFeedContent();
                }
            }

            m.put("targetType", targetType);
            m.put("targetTitle", truncate(title, TITLE_MAX));
            m.put("targetPhoto", photo);
            m.put("targetExists", exists);
            // 自己发出的互动（发帖人本人的点赞 / 评论）：前端显示为「你」
            m.put("isSelf", recipientId != null && recipientId.equals(n.getSenderId()));
            data.add(m);
        }

        Map<String, Object> out = new HashMap<>();
        out.put("data", data);
        out.put("total", (int) total);
        return out;
    }

    public long unreadCount(String recipientId, String type) {
        QueryWrapper<Notification> qw = new QueryWrapper<>();
        qw.eq("recipient_id", recipientId).eq("is_read", false);
        if (type != null && !type.isBlank()) qw.eq("type", type);
        return notificationMapper.selectCount(qw);
    }

    public void markRead(List<String> ids, String recipientId) {
        if (ids == null || ids.isEmpty()) return;
        QueryWrapper<Notification> qw = new QueryWrapper<>();
        qw.in("id", ids).eq("recipient_id", recipientId);
        Notification n = new Notification();
        n.setIsRead(true);
        notificationMapper.update(n, qw);
    }

    public void markAllRead(String recipientId, String type) {
        QueryWrapper<Notification> qw = new QueryWrapper<>();
        qw.eq("recipient_id", recipientId).eq("is_read", false);
        if (type != null && !type.isBlank()) qw.eq("type", type);
        Notification n = new Notification();
        n.setIsRead(true);
        notificationMapper.update(n, qw);
    }

    // ---------- 辅助 ----------

    private static boolean isNotBlank(String s) {
        return s != null && !s.isBlank();
    }

    private static String truncate(String s, int max) {
        if (s == null) return "";
        String t = s.trim().replaceAll("\\s+", " ");
        return t.length() <= max ? t : t.substring(0, max) + "…";
    }

    private static String firstPhoto(List<String> photos) {
        if (photos == null || photos.isEmpty()) return "";
        String p = photos.get(0);
        return p == null ? "" : p;
    }

    /** 众筹在消息里的标题：优先「猫名」，再拼描述。 */
    private static String crowdTitle(Crowdfunding c) {
        String name = c.getCatName() == null ? "" : c.getCatName().trim();
        String desc = c.getDescription() == null ? "" : c.getDescription().trim();
        if (name.isEmpty()) return desc;
        return desc.isEmpty() ? name : name + " · " + desc;
    }
}
