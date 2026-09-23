package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.PaymentService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/payments")
public class PaymentController {

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    /** 演示捐款（不接真实微信支付）。 */
    @PostMapping("/donate")
    public Result<Void> donate(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String crowdId = (String) body.get("crowdId");
        Integer amount = body.get("amount") == null ? 0 : Integer.valueOf(body.get("amount").toString());
        String donorName = (String) body.get("donorName");
        paymentService.demoDonate(openid, crowdId, amount, donorName);
        return Result.ok();
    }

    /** 微信支付统一下单（暂未接入）。 */
    @PostMapping("/orders")
    public Result<Void> createOrder(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String crowdId = (String) body.get("crowdId");
        Integer amount = body.get("amount") == null ? 0 : Integer.valueOf(body.get("amount").toString());
        paymentService.createOrder(openid, crowdId, amount);
        return Result.ok();
    }

    /** 微信支付异步回调：返回纯文本 success（微信要求）。 */
    @PostMapping(value = "/wechat/callback", produces = "text/plain;charset=UTF-8")
    public String wechatCallback(@RequestBody(required = false) String body) {
        return paymentService.payCallback(body);
    }
}
