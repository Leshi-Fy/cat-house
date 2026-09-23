package com.cathouse.entity;

import com.baomidou.mybatisplus.annotation.IdType;
import com.baomidou.mybatisplus.annotation.TableId;
import com.baomidou.mybatisplus.annotation.TableName;
import lombok.Data;

import java.time.LocalDateTime;

@Data
@TableName("users")
public class User {
    @TableId(type = IdType.INPUT)   // 主键 = 微信 openid
    private String id;
    private String nickName;
    private String bio;
    private String hobbies;
    private String catPreference;
    private String avatarUrl;
    private LocalDateTime createTime;
    private LocalDateTime updateTime;
}
