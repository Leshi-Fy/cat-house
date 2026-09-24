package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("crowd_comments")
public class CrowdComment {
    @TableId(type = IdType.INPUT)
    private String id;
    private String crowdId;
    private String content;
    private String authorId;
    private String authorName;
    private String authorAvatar;
    private String parentId;         // null = 一级评论
    private Integer likeCount;
    private LocalDateTime createTime;
}
