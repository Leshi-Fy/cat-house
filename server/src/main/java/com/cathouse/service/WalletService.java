package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.ApiException;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.WalletTransaction;
import com.cathouse.mapper.WalletTransactionMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

/**
 * 钱包：余额由流水实时汇总，不单独存余额字段（避免与流水不一致）。
 *  - 入账来源：报销申请审核通过（由 CrowdService 写入 type=reimburse_in / status=paid）
 *  - 出账来源：用户自助提现（type=withdraw / status=pending，打款后管理员置 paid）
 */
@Service
public class WalletService {

    private final WalletTransactionMapper walletMapper;

    public WalletService(WalletTransactionMapper walletMapper) {
        this.walletMapper = walletMapper;
    }

    /** 已入账总额（分）：报销通过且已入账 */
    public int incomeTotal(String userId) {
        QueryWrapper<WalletTransaction> qw = new QueryWrapper<>();
        qw.eq("user_id", userId).eq("type", "reimburse_in").eq("status", "paid");
        return sum(walletMapper.selectList(qw));
    }

    /** 已提现/冻结总额（分）：pending 与 paid 都占用额度 */
    public int withdrawTotal(String userId) {
        QueryWrapper<WalletTransaction> qw = new QueryWrapper<>();
        qw.eq("user_id", userId).eq("type", "withdraw")
          .in("status", Arrays.asList("pending", "paid"));
        return sum(walletMapper.selectList(qw));
    }

    /** 可提现余额（分） */
    public int balance(String userId) {
        return incomeTotal(userId) - withdrawTotal(userId);
    }

    public Map<String, Object> summary(String userId) {
        int income = incomeTotal(userId);
        int withdraw = withdrawTotal(userId);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("balance", income - withdraw);            // 可提现余额（分）
        m.put("totalIncome", income);                   // 累计入账
        m.put("totalWithdraw", withdraw);               // 累计提现（含冻结中）
        return m;
    }

    public List<Map<String, Object>> list(String userId, long page, long pageSize) {
        QueryWrapper<WalletTransaction> qw = new QueryWrapper<>();
        qw.eq("user_id", userId).orderByDesc("create_time")
          .last("LIMIT " + pageSize + " OFFSET " + (page * pageSize));
        return walletMapper.selectList(qw).stream()
                .map(this::toClient)
                .collect(Collectors.toList());
    }

    /**
     * 提交提现申请：校验余额后写入一条 pending 流水（即刻冻结额度）。
     * ⚠️ 打款（微信企业付款到零钱）尚未接入，pending 由管理员线下打款后置为 paid。
     */
    public Map<String, Object> withdraw(String userId, int amount, String remark) {
        if (amount <= 0) throw new ApiException("提现金额必须大于 0");
        int balance = balance(userId);
        if (amount > balance) {
            throw new ApiException("可提现余额不足，当前余额 ¥" + fen2yuan(balance));
        }
        WalletTransaction t = new WalletTransaction();
        t.setId(UUID.randomUUID().toString());
        t.setUserId(userId);
        t.setType("withdraw");
        t.setAmount(amount);
        t.setStatus("pending");
        t.setRemark(remark == null ? "" : remark);
        t.setCreateTime(LocalDateTime.now());
        t.setUpdateTime(LocalDateTime.now());
        walletMapper.insert(t);
        Map<String, Object> r = new LinkedHashMap<>();
        r.put("id", t.getId());
        r.put("amount", amount);
        r.put("balance", balance(userId));
        return r;
    }

    /** 报销入账（幂等：同一 receiptId 只入账一次） */
    public void creditReimbursement(String userId, String crowdId, String receiptId, int amount, String remark) {
        if (amount <= 0) return;
        QueryWrapper<WalletTransaction> qw = new QueryWrapper<>();
        qw.eq("user_id", userId).eq("type", "reimburse_in")
          .eq("crowd_id", crowdId).eq("receipt_id", receiptId);
        if (walletMapper.selectCount(qw) > 0) return;   // 已入账，忽略（防重复审核导致重复入账）

        WalletTransaction t = new WalletTransaction();
        t.setId(UUID.randomUUID().toString());
        t.setUserId(userId);
        t.setType("reimburse_in");
        t.setAmount(amount);
        t.setStatus("paid");
        t.setCrowdId(crowdId);
        t.setReceiptId(receiptId);
        t.setRemark(remark == null ? "" : remark);
        t.setCreateTime(LocalDateTime.now());
        t.setUpdateTime(LocalDateTime.now());
        walletMapper.insert(t);
    }

    private Map<String, Object> toClient(WalletTransaction t) {
        Map<String, Object> m = FieldUtils.clientMap(t);
        m.put("amountDisplay", fen2yuan(t.getAmount() == null ? 0 : t.getAmount()));
        m.put("typeText", "withdraw".equals(t.getType()) ? "提现" : "报销入账");
        m.put("statusText", statusText(t.getStatus()));
        // 展示用正负号：入账为 +，提现为 -
        m.put("signedDisplay", ("withdraw".equals(t.getType()) ? "-" : "+") + "¥" + fen2yuan(t.getAmount() == null ? 0 : t.getAmount()));
        return m;
    }

    private String statusText(String s) {
        if (s == null) return "";
        switch (s) {
            case "paid": return "已完成";
            case "pending": return "处理中";
            case "rejected": return "已驳回";
            default: return s;
        }
    }

    private int sum(List<WalletTransaction> list) {
        int s = 0;
        for (WalletTransaction t : list) s += (t.getAmount() == null ? 0 : t.getAmount());
        return s;
    }

    public static String fen2yuan(int fen) {
        return String.format(Locale.CHINA, "%.2f", fen / 100.0);
    }
}
