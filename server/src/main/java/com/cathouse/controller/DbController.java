package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.DbService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;

/**
 * 通用数据库代理端点（兼容前端 utils/database.js 的云开发链式调用）。
 * 仅作为从 Supabase/Deno 迁移期间的兼容层；主业务已拆分为各资源 Controller。
 */
@RestController
@RequestMapping("/api/db")
public class DbController {

    private final DbService dbService;

    public DbController(DbService dbService) {
        this.dbService = dbService;
    }

    @PostMapping
    public Result<Map<String, Object>> proxy(@RequestBody Map<String, Object> body) {
        return Result.ok(dbService.handle(body));
    }
}
