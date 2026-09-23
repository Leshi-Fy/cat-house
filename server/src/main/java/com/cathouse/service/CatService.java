package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.ApiException;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.StrayCat;
import com.cathouse.mapper.StrayCatMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@SuppressWarnings("unchecked")
@Service
public class CatService {

    private final StrayCatMapper strayCatMapper;

    public CatService(StrayCatMapper strayCatMapper) {
        this.strayCatMapper = strayCatMapper;
    }

    public String create(String openid, Map<String, Object> catData) {
        StrayCat cat = new StrayCat();
        cat.setId(UUID.randomUUID().toString());
        cat.setName((String) catData.get("name"));
        cat.setDescription((String) catData.get("description"));
        cat.setGender((String) catData.get("gender"));
        cat.setSterilized((String) catData.get("sterilized"));
        cat.setHealthStatus((String) catData.get("healthStatus"));
        cat.setAgeAtCreate(toInt(catData.get("ageAtCreate")));
        cat.setPhotos(asStringList(catData.get("photos")));
        cat.setCreatorId(openid);
        cat.setCreatorName(catData.get("creatorName") == null ? "匿名用户" : (String) catData.get("creatorName"));
        Map<String, Object> loc = (Map<String, Object>) catData.get("location");
        if (loc != null && loc.get("coordinates") instanceof List) {
            List<Object> coords = (List<Object>) loc.get("coordinates");
            if (coords.size() == 2) {
                cat.setLongitude(((Number) coords.get(0)).doubleValue());
                cat.setLatitude(((Number) coords.get(1)).doubleValue());
            }
        }
        cat.setLastSeenTime(toLocalDateTime(catData.get("lastSeenTime")));
        cat.setAreaRadius(toInt(catData.get("areaRadius"), 500));
        cat.setMergeChain(asMapList(catData.get("mergeChain")));
        cat.setAliases(asStringList(catData.get("aliases")));
        cat.setStatus("active");
        cat.setCreateTime(LocalDateTime.now());
        cat.setUpdateTime(LocalDateTime.now());
        strayCatMapper.insert(cat);
        return cat.getId();
    }

    public Map<String, Object> nearby(Double latitude, Double longitude, int page, int pageSize) {
        if (latitude == null || longitude == null) {
            return Map.of("data", Collections.emptyList(), "total", 0);
        }
        QueryWrapper<StrayCat> qw = new QueryWrapper<>();
        qw.eq("status", "active").isNotNull("latitude").isNotNull("longitude");
        List<StrayCat> all = strayCatMapper.selectList(qw);
        List<Map<String, Object>> withDist = new ArrayList<>(all.size());
        for (StrayCat c : all) {
            Map<String, Object> m = FieldUtils.clientMap(c);
            double d = FieldUtils.haversine(latitude, longitude, c.getLatitude(), c.getLongitude());
            m.put("distance", Math.round(d));
            withDist.add(m);
        }
        withDist.sort((a, b) -> {
            Object av = a.get("distance"), bv = b.get("distance");
            long ax = av instanceof Number ? ((Number) av).longValue() : Long.MAX_VALUE;
            long bx = bv instanceof Number ? ((Number) bv).longValue() : Long.MAX_VALUE;
            return Long.compare(ax, bx);
        });
        int from = Math.max(0, page) * pageSize;
        int to = Math.min(from + pageSize, withDist.size());
        List<Map<String, Object>> data = from >= withDist.size() ? Collections.emptyList() : withDist.subList(from, to);
        Map<String, Object> res = new HashMap<>();
        res.put("data", data);
        res.put("total", withDist.size());
        return res;
    }

    public Map<String, Object> detail(String catId) {
        StrayCat c = strayCatMapper.selectById(catId);
        if (c == null) throw new ApiException("猫不存在");
        return FieldUtils.clientMap(c);
    }

    public void update(String openid, String catId, Map<String, Object> updateData) {
        StrayCat c = strayCatMapper.selectById(catId);
        if (c == null) throw new ApiException("猫不存在");
        if (!openid.equals(c.getCreatorId())) throw new ApiException("无权修改");
        applyUpdate(c, updateData);
        c.setUpdateTime(LocalDateTime.now());
        strayCatMapper.updateById(c);
    }

    public List<Map<String, Object>> myCats(String openid) {
        QueryWrapper<StrayCat> qw = new QueryWrapper<>();
        qw.eq("creator_id", openid).eq("status", "active").orderByDesc("create_time").last("LIMIT 50");
        return FieldUtils.toClientList(strayCatMapper.selectList(qw));
    }

    private void applyUpdate(StrayCat c, Map<String, Object> d) {
        if (d.containsKey("name")) c.setName((String) d.get("name"));
        if (d.containsKey("description")) c.setDescription((String) d.get("description"));
        if (d.containsKey("gender")) c.setGender((String) d.get("gender"));
        if (d.containsKey("sterilized")) c.setSterilized((String) d.get("sterilized"));
        if (d.containsKey("healthStatus")) c.setHealthStatus((String) d.get("healthStatus"));
        if (d.containsKey("ageAtCreate")) c.setAgeAtCreate(toInt(d.get("ageAtCreate")));
        if (d.containsKey("photos")) c.setPhotos(asStringList(d.get("photos")));
        if (d.containsKey("creatorName")) c.setCreatorName((String) d.get("creatorName"));
        if (d.containsKey("location") && d.get("location") instanceof Map) {
            Map<String, Object> loc = (Map<String, Object>) d.get("location");
            if (loc.get("coordinates") instanceof List) {
                List<Object> coords = (List<Object>) loc.get("coordinates");
                if (coords.size() == 2) {
                    c.setLongitude(((Number) coords.get(0)).doubleValue());
                    c.setLatitude(((Number) coords.get(1)).doubleValue());
                }
            }
        }
        if (d.containsKey("lastSeenTime")) c.setLastSeenTime(toLocalDateTime(d.get("lastSeenTime")));
        if (d.containsKey("areaRadius")) c.setAreaRadius(toInt(d.get("areaRadius"), 500));
        if (d.containsKey("mergeChain")) c.setMergeChain(asMapList(d.get("mergeChain")));
        if (d.containsKey("aliases")) c.setAliases(asStringList(d.get("aliases")));
        if (d.containsKey("status")) c.setStatus((String) d.get("status"));
    }

    // ---------- 类型/时间辅助 ----------
    private Integer toInt(Object o) {
        return o == null ? null : Integer.valueOf(o.toString());
    }

    private int toInt(Object o, int def) {
        return o == null ? def : Integer.valueOf(o.toString());
    }

    private List<String> asStringList(Object o) {
        if (o instanceof List) {
            List<String> r = new ArrayList<>();
            for (Object x : (List<?>) o) r.add(x == null ? null : x.toString());
            return r;
        }
        return new ArrayList<>();
    }

    private List<Map<String, Object>> asMapList(Object o) {
        if (o instanceof List) return (List<Map<String, Object>>) o;
        return new ArrayList<>();
    }

    private LocalDateTime toLocalDateTime(Object o) {
        if (o == null) return LocalDateTime.now();
        try {
            if (o instanceof Number) {
                long millis = ((Number) o).longValue();
                return new java.sql.Timestamp(millis).toLocalDateTime();
            }
            if (o instanceof String) {
                String s = ((String) o).trim();
                // 带时区的时间（前端 new Date() JSON 序列化为 2026-09-23T06:52:42.000Z），
                // 必须先按时区换算成本地时间，否则直接截断会丢掉 8 小时
                if (s.endsWith("Z") || s.endsWith("z")) {
                    return LocalDateTime.ofInstant(java.time.Instant.parse(s), java.time.ZoneId.systemDefault());
                }
                if (s.matches(".*([+-]\\d{2}:?\\d{2})$")) {
                    return LocalDateTime.ofInstant(java.time.OffsetDateTime.parse(s).toInstant(),
                            java.time.ZoneId.systemDefault());
                }
                if (s.contains("T")) return LocalDateTime.parse(s.substring(0, Math.min(19, s.length())));
                return LocalDateTime.parse(s, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            }
        } catch (Exception ignore) {
        }
        return LocalDateTime.now();
    }
}
