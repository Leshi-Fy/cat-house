package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.HomeCatService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/home-cats")
public class HomeCatController {

    private final HomeCatService homeCatService;

    public HomeCatController(HomeCatService homeCatService) {
        this.homeCatService = homeCatService;
    }

    @PostMapping
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        return Result.ok(Map.of("homeCatId", homeCatService.create(openid, body)));
    }

    @GetMapping("/my")
    public Result<Map<String, Object>> my(@RequestParam("openid") String openid) {
        return Result.ok(Map.of("success", true, "data", homeCatService.myCats(openid)));
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable("id") String id) {
        return Result.ok(homeCatService.detail(id));
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") String id, @RequestParam("openid") String openid) {
        homeCatService.delete(openid, id);
        return Result.ok();
    }
}
