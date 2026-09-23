package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.Notification;
import com.cathouse.mapper.NotificationMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

/**
 * 消息通知（被点赞 / 评论 / 捐款 时生成）。
 * 内部共享服务，其他 Service 注入后调用 createNotification。
 */
@Service
public class NotifyService {

    private final NotificationMapper notificationMapper;

    public NotifyService(NotificationMapper notificationMapper) {
        this.notificationMapper = notificationMapper;
    }

    /**
     * 生成一条通知；recipient == sender 时跳过（自己对自己不产生通知）。
     */
    public void createNotification(String recipientId, String senderId, String senderName, String senderAvatar,
                                   String type, String feedId, String crowdId,
                                   String feedContent, String commentContent, Integer amount) {
        if (recipientId == null || recipientId.equals(senderId)) return;
        Notification n = new Notification();
        n.setId(java.util.UUID.randomUUID().toString());
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

    /**
     * 通知列表。返回「客户端形状」的 Map 列表（snake→camel、id→_id），
     * 与 Deno 版 dbProxy 返回给前端的结构一致，前端按数组直接渲染。
     */
    public List<Map<String, Object>> list(String recipientId, String type, long page, long pageSize) {
        QueryWrapper<Notification> qw = new QueryWrapper<>();
        qw.eq("recipient_id", recipientId);
        if (type != null && !type.isBlank()) qw.eq("type", type);
        qw.orderByDesc("create_time");
        qw.last("LIMIT " + pageSize + " OFFSET " + (page * pageSize));
        return FieldUtils.toClientList(notificationMapper.selectList(qw));
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
}
