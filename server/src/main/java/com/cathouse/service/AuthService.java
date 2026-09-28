package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.ApiException;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.User;
import com.cathouse.mapper.UserMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.HashMap;
import java.util.Map;

@Service
public class AuthService {

    private final WeChatService weChatService;
    private final UserMapper userMapper;
    private final TokenService tokenService;

    public AuthService(WeChatService weChatService, UserMapper userMapper, TokenService tokenService) {
        this.weChatService = weChatService;
        this.userMapper = userMapper;
        this.tokenService = tokenService;
    }

    /**
     * 微信登录：code -> openid；首次登录自动建用户；签发 token。
     * 返回：{ openid, userInfo, isNew, token, expiresIn }
     */
    public Map<String, Object> login(String code) {
        String openid = weChatService.jscode2session(code).getOpenid();
        User existing = userMapper.selectById(openid);
        boolean isNew = existing == null;
        if (isNew) {
            User u = new User();
            u.setId(openid);
            u.setNickName("");
            u.setAvatarUrl("");
            u.setCreateTime(LocalDateTime.now());
            u.setUpdateTime(LocalDateTime.now());
            userMapper.insert(u);
        }
        User u = userMapper.selectById(openid);
        Map<String, Object> res = new HashMap<>();
        res.put("openid", openid);
        res.put("userInfo", FieldUtils.clientMap(u));
        res.put("isNew", isNew);
        // 鉴权 token：后续所有请求需带 Authorization: Bearer <token>
        res.put("token", tokenService.issue(openid));
        res.put("expiresIn", tokenService.ttlMillis() / 1000);
        return res;
    }

    public Map<String, Object> getProfile(String openid) {
        User u = userMapper.selectById(openid);
        if (u == null) throw new ApiException("用户不存在");
        return FieldUtils.clientMap(u);
    }

    @SuppressWarnings("unchecked")
    public void saveProfile(String openid, Map<String, Object> data) {
        User u = userMapper.selectById(openid);
        boolean insert = u == null;
        if (u == null) {
            u = new User();
            u.setId(openid);
            u.setNickName("");
            u.setAvatarUrl("");
            u.setCreateTime(LocalDateTime.now());
        }
        if (data.containsKey("nickName")) u.setNickName((String) data.get("nickName"));
        if (data.containsKey("avatarUrl")) u.setAvatarUrl((String) data.get("avatarUrl"));
        if (data.containsKey("bio")) u.setBio((String) data.get("bio"));
        if (data.containsKey("hobbies")) u.setHobbies((String) data.get("hobbies"));
        if (data.containsKey("catPreference")) u.setCatPreference((String) data.get("catPreference"));
        u.setUpdateTime(LocalDateTime.now());
        if (insert) userMapper.insert(u);
        else userMapper.updateById(u);
    }
}
