package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.MergeService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@RestController
@RequestMapping("/api/merge-requests")
public class MergeController {

    private final MergeService mergeService;

    public MergeController(MergeService mergeService) {
        this.mergeService = mergeService;
    }

    @PostMapping
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String fromCatId = (String) body.get("fromCatId");
        String toCatId = (String) body.get("toCatId");
        String note = (String) body.get("note");
        return Result.ok(Map.of("requestId", mergeService.create(openid, fromCatId, toCatId, note)));
    }

    @PostMapping("/{id}/approve")
    public Result<Map<String, Object>> approve(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        return Result.ok(Map.of("mainCatId", mergeService.approve(openid, id)));
    }

    @PostMapping("/{id}/reject")
    public Result<Void> reject(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String reason = (String) body.get("reason");
        mergeService.reject(openid, id, reason);
        return Result.ok();
    }

    @GetMapping
    public Result<Object> list(@RequestParam(value = "status", required = false) String status,
                              @RequestParam(value = "userId", required = false) String userId) {
        return Result.ok(mergeService.list(status, userId));
    }
}
