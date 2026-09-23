package com.cathouse.controller;

import com.cathouse.common.Result;
import com.cathouse.service.CatService;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

@SuppressWarnings("unchecked")
@RestController
@RequestMapping("/api/cats")
public class CatController {

    private final CatService catService;

    public CatController(CatService catService) {
        this.catService = catService;
    }

    @PostMapping
    public Result<Map<String, Object>> create(@RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        Map<String, Object> catData = (Map<String, Object>) body.get("catData");
        return Result.ok(Map.of("catId", catService.create(openid, catData)));
    }

    @GetMapping("/nearby")
    public Result<Map<String, Object>> nearby(
            @RequestParam(value = "latitude", required = false) Double latitude,
            @RequestParam(value = "longitude", required = false) Double longitude,
            @RequestParam(value = "page", defaultValue = "0") int page,
            @RequestParam(value = "pageSize", defaultValue = "10") int pageSize) {
        return Result.ok(catService.nearby(latitude, longitude, page, pageSize));
    }

    @GetMapping("/my")
    public Result<Map<String, Object>> my(@RequestParam("openid") String openid) {
        return Result.ok(Map.of("success", true, "data", catService.myCats(openid)));
    }

    @GetMapping("/{id}")
    public Result<Map<String, Object>> detail(@PathVariable("id") String id) {
        return Result.ok(catService.detail(id));
    }

    @PutMapping("/{id}")
    public Result<Void> update(@PathVariable("id") String id, @RequestBody Map<String, Object> body) {
        String openid = (String) body.get("openid");
        Map<String, Object> updateData = (Map<String, Object>) body.get("updateData");
        catService.update(openid, id, updateData);
        return Result.ok();
    }
}
