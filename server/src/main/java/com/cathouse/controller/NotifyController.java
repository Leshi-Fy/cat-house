package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.AuthService;
import com.cathouse.service.NotifyService;
import org.springframework.web.bind.annotation.*;

import java.util.HashMap;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/notifications")
public class NotifyController {

    private final NotifyService notifyService;

    public NotifyController(NotifyService notifyService) {
        this.notifyService = notifyService;
    }

    @GetMapping
    public Result<Object> list(@RequestParam("openid") String openid,
                              @RequestParam(value = "type", required = false) String type,
                              @RequestParam(value = "page", defaultValue = "0") long page,
                              @RequestParam(value = "pageSize", defaultValue = "20") long pageSize) {
        return Result.ok(notifyService.list(openid, type, page, pageSize));
    }

    @GetMapping("/unread-count")
    public Result<Map<String, Object>> unreadCount(@RequestParam("openid") String openid) {
        long like = notifyService.unreadCount(openid, "like");
        long comment = notifyService.unreadCount(openid, "comment");
        long donate = notifyService.unreadCount(openid, "donate");
        Map<String, Object> m = new HashMap<>();
        m.put("total", like + comment + donate);
        m.put("likeCount", like);
        m.put("commentCount", comment);
        m.put("donateCount", donate);
        return Result.ok(m);
    }

    @PostMapping("/read")
    public Result<Void> markRead(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        List<String> ids = (List<String>) body.get("ids");
        notifyService.markRead(ids, openid);
        return Result.ok();
    }

    @PostMapping("/read-all")
    public Result<Void> markAllRead(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        String type = (String) body.get("type");
        notifyService.markAllRead(openid, type);
        return Result.ok();
    }
}
