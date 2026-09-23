package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

@Data
// autoResultMap = true：查询时才会对 photos/mergeChain/aliases 应用 JacksonTypeHandler，
// 否则 selectList 走自动生成的 resultMap，JSON 列读出来是 null（写库正常、读库丢字段）
@TableName(value = "stray_cats", autoResultMap = true)
public class StrayCat {
    @TableId(type = IdType.INPUT)
    private String id;
    private String name;
    private String description;
    private String gender;
    private String sterilized;
    private String healthStatus;
    private Integer ageAtCreate;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> photos;
    private String creatorId;
    private String creatorName;
    private LocalDateTime lastSeenTime;
    private Double latitude;
    private Double longitude;
    private Integer areaRadius;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<Map<String, Object>> mergeChain;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> aliases;
    private String status;          // active | merged
    private String mergedInto;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
