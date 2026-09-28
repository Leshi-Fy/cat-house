package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.CrowdService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/**
 * 平台管理：当前仅用于「报销审核」权限判断。
 * 管理员由 cathouse.admin.openids 白名单决定（见 CrowdService）。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final CrowdService crowdService;

    public AdminController(CrowdService crowdService) {
        this.crowdService = crowdService;
    }

    /** 当前用户是否为报销审核管理员（前端据此显示/隐藏「报销审核」入口） */
    @GetMapping("/status")
    public Result<Map<String, Object>> status(@RequestParam("openid") String openid) {
        return Result.ok(Map.of("isAdmin", crowdService.isAdmin(openid)));
    }
}
