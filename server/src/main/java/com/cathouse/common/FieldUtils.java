package com.cathouse.common;

import com.fasterxml.jackson.core.type.TypeReference;

import java.util.*;

/**
 * 行 -> 前端对象 的字段转换（对应 Deno 的 rowToClient / haversine）。
 * 约定：实体字段是 camelCase，数据库列是 snake_case（MyBatis-Plus 自动映射）。
 * 返回给前端时统一：id -> _id；有经纬度则补 location 结构（供地图使用）。
 */
public final class FieldUtils {

    private FieldUtils() {
    }

    public static Map<String, Object> clientMap(Object entity) {
        if (entity == null) return null;
        Map<String, Object> m = JsonUtils.convert(entity, new TypeReference<Map<String, Object>>() {});
        if (m == null) m = new HashMap<>();
        if (m.containsKey("id")) {
            m.put("_id", m.get("id"));
            m.remove("id");
        }
        Object lat = m.get("latitude");
        Object lng = m.get("longitude");
        if (lat instanceof Number && lng instanceof Number) {
            double la = ((Number) lat).doubleValue();
            double ln = ((Number) lng).doubleValue();
            Map<String, Object> loc = new HashMap<>();
            loc.put("type", "Point");
            loc.put("coordinates", Arrays.asList(ln, la));
            loc.put("latitude", la);
            loc.put("longitude", ln);
            m.put("location", loc);
        }
        return m;
    }

    public static List<Map<String, Object>> toClientList(List<?> list) {
        if (list == null) return Collections.emptyList();
        List<Map<String, Object>> out = new ArrayList<>(list.size());
        for (Object o : list) out.add(clientMap(o));
        return out;
    }

    /** haversine 距离，单位：米（对应 Deno 的 haversine）。 */
    public static double haversine(double lat1, double lng1, double lat2, double lng2) {
        final int R = 6371000;
        double dLat = Math.toRadians(lat2 - lat1);
        double dLng = Math.toRadians(lng2 - lng1);
        double a = Math.sin(dLat / 2) * Math.sin(dLat / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }
}
