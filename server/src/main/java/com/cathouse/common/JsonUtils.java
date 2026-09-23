package com.cathouse.common;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.DeserializationFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.datatype.jsr310.deser.LocalDateTimeDeserializer;
import com.fasterxml.jackson.datatype.jsr310.ser.LocalDateTimeSerializer;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;

/**
 * Jackson 封装：解析 / 序列化 / 对象互转。
 *
 * ⚠️ 重要：这里的 MAPPER 是**独立实例**，不会继承 Spring Boot 给 HTTP 层 ObjectMapper 做的自动配置
 * （spring-boot-starter-json 会往容器里那个 mapper 注册 JavaTimeModule，但管不到我们 new 出来的），
 * 所以必须自己注册 JavaTimeModule。否则序列化实体里的 LocalDateTime 会直接抛：
 *   IllegalArgumentException: Java 8 date/time type `java.time.LocalDateTime` not supported by default:
 *   add Module "com.fasterxml.jackson.datatype:jackson-datatype-jsr310" to enable handling
 * 调用链实例：AuthService.login -> FieldUtils.clientMap -> JsonUtils.convert。
 *
 * 时间统一输出 ISO-8601 且精确到秒：2026-09-23T14:34:06
 *  - 必须带 "T"。前端 utils/util.js 用 new Date(str) 解析，空格分隔的 "yyyy-MM-dd HH:mm:ss"
 *    在 iOS 真机（JSCore）上会解析失败、得到 Invalid Date；带 "T" 的 ISO 串是安全格式。
 *  - 固定到秒。LocalDateTime.now() 可能带纳秒，格式化后长度不定，JS 端解析易出差异。
 *  - 反序列化用 ISO_LOCAL_DATE_TIME，带/不带小数秒都能解析（兼容 DB 里 JSON 列的历史数据）。
 *
 * 输出与 HTTP 层保持一致：null 字段不输出（对应 spring.jackson.default-property-inclusion: non_null）。
 */
public final class JsonUtils {

    /** 对外统一的时间格式：ISO-8601 到秒。DbService 读回行时也用这个格式，改这里请同步改那边。 */
    public static final String ISO_SECONDS_PATTERN = "yyyy-MM-dd'T'HH:mm:ss";

    private static final ObjectMapper MAPPER = build();

    private JsonUtils() {
    }

    private static ObjectMapper build() {
        DateTimeFormatter isoSeconds = DateTimeFormatter.ofPattern(ISO_SECONDS_PATTERN);
        JavaTimeModule javaTime = new JavaTimeModule();
        javaTime.addSerializer(LocalDateTime.class, new LocalDateTimeSerializer(isoSeconds));
        javaTime.addDeserializer(LocalDateTime.class, new LocalDateTimeDeserializer(DateTimeFormatter.ISO_LOCAL_DATE_TIME));
        return new ObjectMapper()
                .registerModule(javaTime)
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS)
                .disable(DeserializationFeature.FAIL_ON_UNKNOWN_PROPERTIES)
                .setSerializationInclusion(JsonInclude.Include.NON_NULL);
    }

    public static String toJson(Object obj) {
        try {
            return MAPPER.writeValueAsString(obj);
        } catch (Exception e) {
            throw new RuntimeException(e);
        }
    }

    public static <T> T fromJson(String json, Class<T> clazz) {
        try {
            return MAPPER.readValue(json, clazz);
        } catch (Exception e) {
            return null;
        }
    }

    @SuppressWarnings("unchecked")
    public static <T> T fromJson(String json, TypeReference<T> typeRef) {
        try {
            return MAPPER.readValue(json, typeRef);
        } catch (Exception e) {
            return null;
        }
    }

    public static <T> T convert(Object obj, Class<T> clazz) {
        return MAPPER.convertValue(obj, clazz);
    }

    public static <T> T convert(Object obj, TypeReference<T> typeRef) {
        return MAPPER.convertValue(obj, typeRef);
    }
}
