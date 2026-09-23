package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("donations")
public class Donation {
    @TableId(type = IdType.INPUT)
    private String id;
    private String crowdId;
    private String donorId;
    private String donorName;
    private Integer amount;          // 分
    private String paymentMethod;
    private String paymentStatus;    // paid | pending
    private String outTradeNo;
    private LocalDateTime createTime;
}
