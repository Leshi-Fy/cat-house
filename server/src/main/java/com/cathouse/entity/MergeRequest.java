package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("merge_requests")
public class MergeRequest {
    @TableId(type = IdType.INPUT)
    private String id;
    private String fromCatId;
    private String fromCatName;
    private String fromUserId;
    private String toCatId;
    private String toCatName;
    private String toUserId;
    private String applicantId;
    private String status;           // pending | approved | rejected
    private String note;
    private String approvedById;
    private LocalDateTime approvedTime;
    private String rejectedById;
    private String rejectReason;
    private LocalDateTime createTime;
}
