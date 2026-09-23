package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.AuthService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/users")
public class UserController {

    private final AuthService authService;

    public UserController(AuthService authService) {
        this.authService = authService;
    }

    @GetMapping("/me")
    public Result<Map<String, Object>> profile(@RequestParam("openid") String openid) {
        return Result.ok(authService.getProfile(openid));
    }

    @PutMapping("/me")
    public Result<Void> saveProfile(@RequestParam("openid") String openid, @RequestBody Map<String, Object> body) {
        authService.saveProfile(openid, body);
        return Result.ok();
    }
}
