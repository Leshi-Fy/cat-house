package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.CrowdService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@SuppressWarnings("unchecked")
@RestController
@RequestMapping("/api/crowdfundings")
public class CrowdController {

    private final CrowdService crowdService;

    public CrowdController(CrowdService crowdService) {
        this.crowdService = crowdService;
    }

    @PostMapping
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        Map<String, Object> crowdData = (Map<String, Object>) body.get("crowdData");
        return Result.ok(Map.of("crowdId", crowdService.create(openid, crowdData)));
    }

    @GetMapping
    public Result<Map<String, Object>> list(
            @RequestParam(value = "status", required = false) String status,
            @RequestParam(value = "page", defaultValue = "0") long page,
            @RequestParam(value = "pageSize", defaultValue = "10") long pageSize,
            @RequestParam(value = "openid", required = false) String openid) {
        return Result.ok(crowdService.list(status, page, pageSize, openid));
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable("id") String id,
                                              @RequestParam(value = "openid", required = false) String openid) {
        return Result.ok(crowdService.detail(id, openid));
    }

    @PostMapping("/{id}/like")
    public Result<Void> like(@PathVariable("id") String id, @RequestParam("openid") String openid) {
        crowdService.like(openid, id);
        return Result.ok();
    }

    @DeleteMapping("/{id}/like")
    public Result<Void> unlike(@PathVariable("id") String id, @RequestParam("openid") String openid) {
        crowdService.unlike(openid, id);
        return Result.ok();
    }

    @PostMapping("/{id}/comments")
    public Result<Map<String, Object>> addComment(@PathVariable("id") String id,
                                                  @RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String content = (String) body.get("content");
        String parentId = (String) body.get("parentId");
        return Result.ok(crowdService.addComment(openid, id, content, parentId));
    }

    @GetMapping("/{id}/comments")
    public Result<Map<String, Object>> listComments(@PathVariable("id") String id,
                                                    @RequestParam(value = "openid", required = false) String openid,
                                                    @RequestParam(value = "page", defaultValue = "0") long page,
                                                    @RequestParam(value = "pageSize", defaultValue = "20") long pageSize) {
        return Result.ok(crowdService.listComments(id, page, pageSize, openid));
    }

    @GetMapping("/comments/{commentId}/replies")
    public Result<Map<String, Object>> listReplies(@PathVariable("commentId") String commentId) {
        return Result.ok(crowdService.listReplies(commentId));
    }

    @DeleteMapping("/comments/{commentId}")
    public Result<Void> deleteComment(@PathVariable("commentId") String commentId,
                                      @RequestParam("openid") String openid) {
        crowdService.deleteComment(openid, commentId);
        return Result.ok();
    }

    @PostMapping("/{id}/receipts")
    public Result<Void> applyReceipt(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        Integer amount = body.get("amount") == null ? 0 : Integer.valueOf(body.get("amount").toString());
        String remark = (String) body.get("remark");
        List<String> receipts = (List<String>) body.get("receipts");
        crowdService.applyReceipt(openid, id, amount, remark, receipts);
        return Result.ok();
    }

    @PostMapping("/{id}/receipts/approve")
    public Result<Void> approveReceipt(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        Boolean approved = Boolean.TRUE.equals(body.get("approved"));
        crowdService.approveReceipt(id, approved != null && approved);
        return Result.ok();
    }

    @PostMapping("/{id}/complete")
    public Result<Void> complete(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        crowdService.completeCrowd(id);
        return Result.ok();
    }
}
