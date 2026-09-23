package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.ApiException;
import com.cathouse.entity.Crowdfunding;
import com.cathouse.entity.Donation;
import com.cathouse.entity.User;
import com.cathouse.mapper.CrowdfundingMapper;
import com.cathouse.mapper.DonationMapper;
import com.cathouse.mapper.UserMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.UUID;

@Service
public class PaymentService {

    private final DonationMapper donationMapper;
    private final CrowdfundingMapper crowdfundingMapper;
    private final UserMapper userMapper;
    private final NotifyService notifyService;

    public PaymentService(DonationMapper donationMapper, CrowdfundingMapper crowdfundingMapper,
                          UserMapper userMapper, NotifyService notifyService) {
        this.donationMapper = donationMapper;
        this.crowdfundingMapper = crowdfundingMapper;
        this.userMapper = userMapper;
        this.notifyService = notifyService;
    }

    /**
     * 演示捐款（不接真实微信支付）：直接记账 + 累加众筹已筹 + 通知发起人。
     */
    public void demoDonate(String openid, String crowdId, int amount, String donorName) {
        if (crowdId == null || crowdId.isBlank() || amount <= 0) throw new ApiException("参数错误");
        Donation d = new Donation();
        d.setId(UUID.randomUUID().toString());
        d.setCrowdId(crowdId);
        d.setDonorId(openid);
        d.setDonorName(donorName == null || donorName.isBlank() ? "匿名爱心人士" : donorName);
        d.setAmount(amount);
        d.setPaymentMethod("demo");
        d.setPaymentStatus("paid");
        d.setCreateTime(LocalDateTime.now());
        donationMapper.insert(d);

        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c != null) {
            c.setRaisedAmount((c.getRaisedAmount() == null ? 0 : c.getRaisedAmount()) + amount);
            c.setUpdateTime(LocalDateTime.now());
            crowdfundingMapper.updateById(c);
            if (c.getInitiatorId() != null && !c.getInitiatorId().equals(openid)) {
                User sender = userMapper.selectById(openid);
                notifyService.createNotification(c.getInitiatorId(), openid,
                        sender != null ? sender.getNickName() : donorName,
                        sender != null ? sender.getAvatarUrl() : "",
                        "donate", null, crowdId,
                        (c.getDescription() == null ? "" : c.getDescription()).substring(0, Math.min(50, c.getDescription() == null ? 0 : c.getDescription().length())),
                        null, amount);
            }
        }
    }

    public void createOrder(String openid, String crowdId, int amount) {
        // TODO: 接入微信支付（统一下单 + 小程序 wx.requestPayment）。
        // 详见 server/README.md「微信支付接入」一节。
        throw new ApiException("微信支付尚未接入，请使用 demo_donate 模式");
    }

    public String payCallback(String body) {
        // TODO: 校验签名 + 更新 donation 状态 + 累加众筹。当前为占位，直接返回 success。
        return "success";
    }
}
