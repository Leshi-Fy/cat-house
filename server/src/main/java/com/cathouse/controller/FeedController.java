package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.FeedService;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;

@SuppressWarnings("unchecked")
@RestController
@RequestMapping("/api/feeds")
public class FeedController {

    private final FeedService feedService;

    public FeedController(FeedService feedService) {
        this.feedService = feedService;
    }

    @PostMapping
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String content = (String) body.get("content");
        List<String> photos = (List<String>) body.get("photos");
        String catId = (String) body.get("catId");
        return Result.ok(Map.of("feedId", feedService.create(openid, content, photos, catId)));
    }

    @GetMapping
    public Result<Map<String, Object>> list(
            @RequestParam(value = "page", defaultValue = "0") long page,
            @RequestParam(value = "pageSize", defaultValue = "10") long pageSize,
            @RequestParam(value = "openid", required = false) String openid) {
        return Result.ok(feedService.list(page, pageSize, openid));
    }

    @GetMapping("/my")
    public Result<Map<String, Object>> myFeeds(
            @RequestParam("openid") String openid,
            @RequestParam(value = "page", defaultValue = "0") long page,
            @RequestParam(value = "pageSize", defaultValue = "10") long pageSize) {
        return Result.ok(feedService.myFeeds(openid, page, pageSize));
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable("id") String id,
                                             @RequestParam(value = "openid", required = false) String openid) {
        return Result.ok(feedService.getDetail(openid, id));
    }

    @PutMapping("/{id}")
    public Result<Void> update(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String content = (String) body.get("content");
        List<String> photos = (List<String>) body.get("photos");
        String catId = (String) body.get("catId");
        feedService.update(openid, id, content, photos, catId);
        return Result.ok();
    }

    @DeleteMapping("/{id}")
    public Result<Void> delete(@PathVariable("id") String id, @RequestParam("openid") String openid) {
        feedService.delete(openid, id);
        return Result.ok();
    }

    @PostMapping("/{id}/like")
    public Result<Void> like(@PathVariable("id") String id, @RequestParam("openid") String openid) {
        feedService.like(openid, id);
        return Result.ok();
    }

    @DeleteMapping("/{id}/like")
    public Result<Void> unlike(@PathVariable("id") String id, @RequestParam("openid") String openid) {
        feedService.unlike(openid, id);
        return Result.ok();
    }

    @PostMapping("/{id}/comments")
    public Result<Map<String, Object>> addComment(@PathVariable("id") String id,
                                                  @RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String content = (String) body.get("content");
        String parentId = (String) body.get("parentId");
        return Result.ok(feedService.addComment(openid, id, content, parentId));
    }

    @GetMapping("/{id}/comments")
    public Result<Map<String, Object>> listComments(@PathVariable("id") String id,
                                                   @RequestParam(value = "openid", required = false) String openid,
                                                   @RequestParam(value = "page", defaultValue = "0") long page,
                                                   @RequestParam(value = "pageSize", defaultValue = "20") long pageSize) {
        return Result.ok(feedService.listComments(id, page, pageSize, openid));
    }

    @DeleteMapping("/comments/{commentId}")
    public Result<Void> deleteComment(@PathVariable("commentId") String commentId, @RequestParam("openid") String openid) {
        feedService.deleteComment(openid, commentId);
        return Result.ok();
    }

    @GetMapping("/comments/{commentId}/replies")
    public Result<Map<String, Object>> listReplies(@PathVariable("commentId") String commentId) {
        return Result.ok(feedService.listReplies(commentId));
    }
}
