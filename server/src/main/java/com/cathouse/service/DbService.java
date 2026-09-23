package com.cathouse.service;

import com.cathouse.common.JsonUtils;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.*;

/**
 * 通用数据库代理（替代 Deno 版 index.ts 的 dbProxy）。
 * 前端 utils/database.js 通过 wx.cloud.database() 适配器，把云开发的链式调用
 * 转发到本服务的 POST /api/db，协议完全一致：
 *   { op:'get'|'list'|'count'|'add'|'update'|'remove', collection, id, where, orderBy, skip, limit, data }
 * 返回与 Deno 相同的信封：get/list -> { data: [...] }，count -> { total }，add -> { _id }，update/remove -> { success:true }
 *
 * 读回的行会做 snake->camel、id->_id、经纬度补 location（与 FieldUtils.clientMap 一致）。
 * 写入时 camel->snake，JSON 列序列化，create_time/update_time 由服务端生成。
 */
@Service
@SuppressWarnings("unchecked")
public class DbService {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper = new ObjectMapper();

    // collection 名 -> 表名（白名单，防止任意表访问）
    private static final Map<String, String> TABLES = new LinkedHashMap<>();
    // 各表的 JSON 列（写入时需序列化为字符串，读回时需解析）
    private static final Map<String, Set<String>> JSON_COLUMNS = new HashMap<>();
    // 读回行的时间格式：与 JsonUtils 输出保持一致（ISO-8601 到秒）。
    // 必须带 "T"：前端 util.js 用 new Date(str) 解析，空格格式在 iOS 真机会得到 Invalid Date。
    private static final DateTimeFormatter CLIENT_TIME_FMT =
            DateTimeFormatter.ofPattern(JsonUtils.ISO_SECONDS_PATTERN);

    static {
        TABLES.put("users", "users");
        TABLES.put("stray_cats", "stray_cats");
        TABLES.put("home_cats", "home_cats");
        TABLES.put("crowdfundings", "crowdfundings");
        TABLES.put("donations", "donations");
        TABLES.put("merge_requests", "merge_requests");
        TABLES.put("feeds", "feeds");
        TABLES.put("feed_comments", "feed_comments");
        TABLES.put("feed_likes", "feed_likes");
        TABLES.put("notifications", "notifications");

        JSON_COLUMNS.put("stray_cats", Set.of("photos", "merge_chain", "aliases"));
        JSON_COLUMNS.put("home_cats", Set.of("photos"));
        JSON_COLUMNS.put("crowdfundings", Set.of("photos", "receipt_records"));
        JSON_COLUMNS.put("feeds", Set.of("photos", "cat_info"));
    }

    public DbService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public Map<String, Object> handle(Map<String, Object> body) {
        String op = (String) body.get("op");
        String collection = (String) body.get("collection");
        String table = TABLES.get(collection);
        if (table == null) return Map.of("error", "未知集合: " + collection);
        Set<String> jsonCols = JSON_COLUMNS.getOrDefault(collection, Collections.emptySet());

        switch (op) {
            case "get": {
                String id = (String) body.get("id");
                Map<String, Object> row = jdbcTemplate.queryForList(
                        "SELECT * FROM " + table + " WHERE id = ?", id).stream().findFirst().orElse(null);
                Map<String, Object> result = new HashMap<>();
                result.put("data", row == null ? null : rowToClient(row, jsonCols));
                return result;
            }
            case "list": {
                Map<String, Object> where = (Map<String, Object>) body.get("where");
                Map<String, Object> orderBy = (Map<String, Object>) body.get("orderBy");
                int skip = body.get("skip") instanceof Number ? ((Number) body.get("skip")).intValue() : 0;
                int limit = body.get("limit") instanceof Number ? ((Number) body.get("limit")).intValue() : 100;
                List<Object> args = new ArrayList<>();
                String whereSql = buildWhere(where, args, jsonCols);
                String orderSql = buildOrder(orderBy);
                List<Map<String, Object>> rows = jdbcTemplate.queryForList(
                        "SELECT * FROM " + table + whereSql + orderSql + " LIMIT ? OFFSET ?",
                        concatArgs(args, limit, Math.max(0, skip)));
                List<Map<String, Object>> data = new ArrayList<>(rows.size());
                for (Map<String, Object> r : rows) data.add(rowToClient(r, jsonCols));
                return Map.of("data", data);
            }
            case "count": {
                Map<String, Object> where = (Map<String, Object>) body.get("where");
                List<Object> args = new ArrayList<>();
                String whereSql = buildWhere(where, args, jsonCols);
                Long total = jdbcTemplate.queryForObject(
                        "SELECT COUNT(*) FROM " + table + whereSql, args.toArray(), Long.class);
                return Map.of("total", total == null ? 0L : total);
            }
            case "add": {
                Map<String, Object> data = (Map<String, Object>) body.get("data");
                if (data == null) data = new HashMap<>();
                // 优先使用前端指定的主键：_id 是云开发规范写法，id 作为兼容写法。
                // ⚠️ 必须保留，否则 users 表的 id 拿不到 openid，登录/我的猫等按 openid 查询会全部落空。
                Object idVal = data.get("_id") != null ? data.get("_id") : data.get("id");
                String id = (idVal != null && !String.valueOf(idVal).trim().isEmpty())
                        ? String.valueOf(idVal).trim()
                        : UUID.randomUUID().toString();
                Map<String, Object> row = buildInsertRow(data, jsonCols);
                row.put("id", id);
                row.put("create_time", Timestamp.valueOf(LocalDateTime.now()));
                row.put("update_time", Timestamp.valueOf(LocalDateTime.now()));
                String columns = String.join(",", row.keySet());
                String placeholders = String.join(",", Collections.nCopies(row.size(), "?"));
                Object[] vals = row.values().toArray();
                jdbcTemplate.update("INSERT INTO " + table + " (" + columns + ") VALUES (" + placeholders + ")", vals);
                return Map.of("_id", id);
            }
            case "update": {
                String id = (String) body.get("id");
                Map<String, Object> data = (Map<String, Object>) body.get("data");
                if (data == null || data.isEmpty()) return Map.of("success", true);
                Map<String, Object> row = buildInsertRow(data, jsonCols);
                row.remove("id"); // 主键不可通过 update 改写
                row.put("update_time", Timestamp.valueOf(LocalDateTime.now()));
                List<String> sets = new ArrayList<>();
                List<Object> args = new ArrayList<>();
                for (Map.Entry<String, Object> e : row.entrySet()) {
                    sets.add(e.getKey() + " = ?");
                    args.add(e.getValue());
                }
                args.add(id);
                jdbcTemplate.update("UPDATE " + table + " SET " + String.join(",", sets) + " WHERE id = ?",
                        args.toArray());
                return Map.of("success", true);
            }
            case "remove": {
                String id = (String) body.get("id");
                jdbcTemplate.update("DELETE FROM " + table + " WHERE id = ?", id);
                return Map.of("success", true);
            }
            default:
                return Map.of("error", "未知 db 操作: " + op);
        }
    }

    // ---------- where 构造 ----------
    private String buildWhere(Map<String, Object> where, List<Object> args, Set<String> jsonCols) {
        if (where == null || where.isEmpty()) return "";
        List<String> clauses = new ArrayList<>();
        for (Map.Entry<String, Object> e : where.entrySet()) {
            if (e.getKey() == null || e.getKey().startsWith("_")) continue; // 跳过 _id 等非列字段
            String col = snake(e.getKey());
            if (!isValidColumn(col)) continue; // 仅允许 [a-z0-9_] 列名，防注入
            Object v = e.getValue();
            if (v == null) {
                clauses.add(col + " IS NULL");
            } else if (v instanceof Map) {
                Map<String, Object> m = (Map<String, Object>) v;
                if (m.containsKey("__regex")) {
                    clauses.add("LOWER(" + col + ") LIKE ?");
                    args.add("%" + String.valueOf(m.get("__regex")).toLowerCase() + "%");
                } else if (m.containsKey("__in")) {
                    List<Object> arr = (List<Object>) m.get("__in");
                    if (arr != null && !arr.isEmpty()) {
                        clauses.add(col + " IN (" + String.join(",", Collections.nCopies(arr.size(), "?")) + ")");
                        args.addAll(arr);
                    }
                } else if (m.containsKey("__gt")) {
                    clauses.add(col + " > ?");
                    args.add(m.get("__gt"));
                } else if (m.containsKey("__gte")) {
                    clauses.add(col + " >= ?");
                    args.add(m.get("__gte"));
                } else if (m.containsKey("__lt")) {
                    clauses.add(col + " < ?");
                    args.add(m.get("__lt"));
                } else if (m.containsKey("__lte")) {
                    clauses.add(col + " <= ?");
                    args.add(m.get("__lte"));
                } else if (m.containsKey("__neq")) {
                    clauses.add(col + " <> ?");
                    args.add(m.get("__neq"));
                } else {
                    clauses.add(col + " = ?");
                    args.add(v);
                }
            } else {
                clauses.add(col + " = ?");
                args.add(v);
            }
        }
        return clauses.isEmpty() ? "" : " WHERE " + String.join(" AND ", clauses);
    }

    private String buildOrder(Map<String, Object> orderBy) {
        if (orderBy == null || orderBy.get("field") == null) return "";
        String col = snake(String.valueOf(orderBy.get("field")));
        if (!isValidColumn(col)) return "";
        String dir = "asc".equalsIgnoreCase(String.valueOf(orderBy.get("dir"))) ? "ASC" : "DESC";
        return " ORDER BY " + col + " " + dir;
    }

    // ---------- 写入行构造（camel->snake + JSON 序列化） ----------
    private Map<String, Object> buildInsertRow(Map<String, Object> data, Set<String> jsonCols) {
        Map<String, Object> row = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : data.entrySet()) {
            if (e.getKey() == null || e.getKey().startsWith("_")) continue; // 跳过 _id 等非列字段
            String col = snake(e.getKey());
            if (!isValidColumn(col)) continue;
            Object val = e.getValue();
            if (jsonCols.contains(col) && val != null && !(val instanceof String)) {
                try {
                    val = objectMapper.writeValueAsString(val);
                } catch (Exception ignore) {
                }
            }
            row.put(col, val);
        }
        return row;
    }

    // ---------- 读回行转换（snake->camel + _id + location + JSON 解析） ----------
    private Map<String, Object> rowToClient(Map<String, Object> row, Set<String> jsonCols) {
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            String key = e.getKey();
            Object val = e.getValue();
            if ("id".equals(key)) {
                out.put("_id", val);
                continue;
            }
            String camel = camel(key);
            if (val instanceof Timestamp) {
                // 与 JsonUtils / FieldUtils 一致：ISO-8601（带 T），前端 new Date() 在 iOS 真机也安全
                val = CLIENT_TIME_FMT.format(((Timestamp) val).toLocalDateTime());
            } else if (val instanceof java.sql.Date) {
                val = val.toString();
            } else if (jsonCols.contains(key) && val instanceof String) {
                try {
                    val = objectMapper.readValue((String) val, new TypeReference<Object>() {});
                } catch (Exception ignore) {
                }
            }
            out.put(camel, val);
        }
        Object lat = out.get("latitude");
        Object lng = out.get("longitude");
        if (lat instanceof Number && lng instanceof Number) {
            double la = ((Number) lat).doubleValue();
            double ln = ((Number) lng).doubleValue();
            Map<String, Object> loc = new LinkedHashMap<>();
            loc.put("type", "Point");
            loc.put("coordinates", Arrays.asList(ln, la));
            loc.put("latitude", la);
            loc.put("longitude", ln);
            out.put("location", loc);
        }
        return out;
    }

    // ---------- 工具 ----------
    private boolean isValidColumn(String col) {
        return col != null && col.matches("^[a-z0-9_]+$");
    }

    private Object[] concatArgs(List<Object> args, Object... extra) {
        List<Object> all = new ArrayList<>(args);
        all.addAll(Arrays.asList(extra));
        return all.toArray();
    }

    private String snake(String s) {
        if (s == null) return null;
        StringBuilder sb = new StringBuilder();
        for (char c : s.toCharArray()) {
            if (Character.isUpperCase(c)) {
                sb.append('_').append(Character.toLowerCase(c));
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }

    private String camel(String s) {
        StringBuilder sb = new StringBuilder();
        boolean up = false;
        for (char c : s.toCharArray()) {
            if (c == '_') {
                up = true;
            } else if (up) {
                sb.append(Character.toUpperCase(c));
                up = false;
            } else {
                sb.append(c);
            }
        }
        return sb.toString();
    }
}
