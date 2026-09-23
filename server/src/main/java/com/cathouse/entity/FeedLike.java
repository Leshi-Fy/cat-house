package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("feed_likes")
public class FeedLike {
    @TableId(type = IdType.INPUT)
    private String id;
    private String feedId;
    private String userId;
    private LocalDateTime createTime;
}
