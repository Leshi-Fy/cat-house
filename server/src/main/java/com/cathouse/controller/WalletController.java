package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.WalletService;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 钱包：余额 / 流水 / 提现。
 * 入账由报销审核通过触发（CrowdService 调 WalletService.creditReimbursement），本控制器只负责查询与提现。
 */
@RestController
@RequestMapping("/api/wallet")
public class WalletController {

    private final WalletService walletService;

    public WalletController(WalletService walletService) {
        this.walletService = walletService;
    }

    /** 余额汇总：{ balance, totalIncome, totalWithdraw }（单位：分） */
    @GetMapping
    public Result<Map<String, Object>> summary(@RequestParam("openid") String openid) {
        return Result.ok(walletService.summary(openid));
    }

    @GetMapping("/transactions")
    public Result<Map<String, Object>> transactions(@RequestParam("openid") String openid,
                                                    @RequestParam(value = "page", defaultValue = "0") long page,
                                                    @RequestParam(value = "pageSize", defaultValue = "20") long pageSize) {
        List<Map<String, Object>> data = walletService.list(openid, page, pageSize);
        Map<String, Object> m = new LinkedHashMap<>();
        m.put("data", data);
        m.put("balance", walletService.balance(openid));
        return Result.ok(m);
    }

    /**
     * 提交提现申请。
     * ⚠️ 打款通道（微信企业付款到零钱）尚未接入：提交后为 pending（额度即刻冻结），
     *    由管理员线下打款后再置为 paid。
     */
    @PostMapping("/withdraw")
    public Result<Map<String, Object>> withdraw(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        int amount = body.get("amount") == null ? 0 : Integer.parseInt(body.get("amount").toString());
        String remark = (String) body.get("remark");
        return Result.ok(walletService.withdraw(openid, amount, remark));
    }
}
