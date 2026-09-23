package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
@TableName(value = "feeds", autoResultMap = true)
public class Feed {
    @TableId(type = IdType.INPUT)
    private String id;
    private String content;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> photos;
    private String authorId;
    private String authorName;
    private String authorAvatar;
    private String catId;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private Map<String, Object> catInfo;
    private Integer likeCount;
    private Integer commentCount;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
