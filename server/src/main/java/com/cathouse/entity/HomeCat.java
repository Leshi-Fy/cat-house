package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableField;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import com.baomidou.mybatisplus.extension.handlers.JacksonTypeHandler;
import lombok.Data;

import java.time.LocalDateTime;
import java.util.List;

@Data
@TableName(value = "home_cats", autoResultMap = true)
public class HomeCat {
    @TableId(type = IdType.INPUT)
    private String id;
    private String name;
    private String breed;
    private String age;
    private String gender;
    private String personality;
    @TableField(typeHandler = JacksonTypeHandler.class)
    private List<String> photos;
    private String ownerId;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
