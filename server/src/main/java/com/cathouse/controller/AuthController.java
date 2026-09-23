package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.AuthService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/login")
    public Result<Map<String, Object>> login(@RequestBody Map<String, Object> body) {
        String code = (String) body.get("code");
        return Result.ok(authService.login(code));
    }
}
