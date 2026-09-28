package com.cathouse.task;

import com.baomidou.mybatisplus.core.conditions.update.UpdateWrapper;
import com.cathouse.entity.Crowdfunding;
import com.cathouse.mapper.CrowdfundingMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.LocalDateTime;

/**
 * 众筹到期自动结束：把 deadline 已过、仍是 ongoing 的众筹置为 completed。
 * 一条 UPDATE 搞定，deadline 为 NULL 的记录不会被匹配（不限期众筹不受影响）。
 */
@Component
public class CrowdExpireTask {

    private static final Logger log = LoggerFactory.getLogger(CrowdExpireTask.class);

    private final CrowdfundingMapper crowdfundingMapper;

    public CrowdExpireTask(CrowdfundingMapper crowdfundingMapper) {
        this.crowdfundingMapper = crowdfundingMapper;
    }

    /** 默认每 10 分钟扫一次；改配置 cathouse.task.expire-delay-ms 可调 */
    @Scheduled(fixedDelayString = "${cathouse.task.expire-delay-ms:600000}")
    public void expireOverdueCrowdfundings() {
        try {
            UpdateWrapper<Crowdfunding> uw = new UpdateWrapper<>();
            uw.eq("status", "ongoing")
              .lt("deadline", LocalDateTime.now())
              .set("status", "completed")
              .set("update_time", LocalDateTime.now());
            int n = crowdfundingMapper.update(null, uw);
            if (n > 0) {
                log.info("[CrowdExpireTask] 自动结束到期众筹 {} 条", n);
            }
        } catch (Exception e) {
            // 定时任务异常不能冒泡，否则会中断后续调度
            log.warn("[CrowdExpireTask] 执行失败: {}", e.getMessage());
        }
    }
}
