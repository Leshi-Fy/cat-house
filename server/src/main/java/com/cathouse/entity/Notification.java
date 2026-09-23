package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("notifications")
public class Notification {
    @TableId(type = IdType.INPUT)
    private String id;
    private String recipientId;
    private String senderId;
    private String senderName;
    private String senderAvatar;
    private String type;             // like | comment | donate
    private String feedId;
    private String crowdId;
    private String feedContent;
    private String commentContent;
    private Integer amount;
    private Boolean isRead;
    private LocalDateTime createTime;
}
