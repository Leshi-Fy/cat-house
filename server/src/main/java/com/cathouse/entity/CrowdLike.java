package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("crowd_likes")
public class CrowdLike {
    @TableId(type = IdType.INPUT)
    private String id;
    private String crowdId;
    private String userId;
    private LocalDateTime createTime;
}
