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
@TableName(value = "crowdfundings", autoResultMap = true)
public class Crowdfunding {
    @TableId(type = IdType.INPUT)
    private String id;
    private String catId;
    private String catName;
    private String catPhoto;
    private String crowdType;
    private String description;
    private Integer targetAmount;    // 单位：分
    private Integer raisedAmount;    // 单位：分
    private String status;           // ongoing | completed
    private LocalDateTime deadline;
    private String initiatorId;
    private String initiatorName;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> photos;
    private String receiptStatus;    // none | pending | approved | rejected
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> receiptRecords;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
