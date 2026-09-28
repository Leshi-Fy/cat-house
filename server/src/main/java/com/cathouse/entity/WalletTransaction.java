package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

/**
 * 钱包流水。
 * 钱包余额 = Σ(reimburse_in, status=paid) - Σ(withdraw, status in (pending, paid))
 * （提现提交即冻结，pending 也占用额度，防止超提）
 */
@Data
@TableName("wallet_transactions")
public class WalletTransaction {
    @TableId(type = IdType.INPUT)
    private String id;
    private String userId;
    private String type;        // reimburse_in | withdraw
    private Integer amount;     // 分，正数
    private String status;      // pending | paid | rejected
    private String crowdId;
    private String receiptId;
    private String remark;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
