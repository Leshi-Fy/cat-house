package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.ApiException;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.HomeCat;
import com.cathouse.mapper.HomeCatMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@SuppressWarnings("unchecked")
@Service
public class HomeCatService {

    private final HomeCatMapper homeCatMapper;

    public HomeCatService(HomeCatMapper homeCatMapper) {
        this.homeCatMapper = homeCatMapper;
    }

    public String create(String openid, Map<String, Object> data) {
        HomeCat c = new HomeCat();
        c.setId(UUID.randomUUID().toString());
        c.setName((String) data.get("name"));
        c.setBreed((String) data.get("breed"));
        c.setAge((String) data.get("age"));
        c.setGender((String) data.get("gender"));
        c.setPersonality((String) data.get("personality"));
        c.setPhotos(asStringList(data.get("photos")));
        c.setOwnerId(openid);
        c.setCreateTime(LocalDateTime.now());
        c.setUpdateTime(LocalDateTime.now());
        homeCatMapper.insert(c);
        return c.getId();
    }

    public List<Map<String, Object>> myCats(String openid) {
        QueryWrapper<HomeCat> qw = new QueryWrapper<>();
        qw.eq("owner_id", openid).orderByDesc("create_time").last("LIMIT 100");
        return FieldUtils.toClientList(homeCatMapper.selectList(qw));
    }

    public Map<String, Object> detail(String id) {
        HomeCat c = homeCatMapper.selectById(id);
        if (c == null) throw new ApiException("家猫不存在");
        return FieldUtils.clientMap(c);
    }

    public void delete(String openid, String id) {
        HomeCat c = homeCatMapper.selectById(id);
        if (c == null) throw new ApiException("家猫不存在");
        if (!openid.equals(c.getOwnerId())) throw new ApiException("无权删除");
        homeCatMapper.deleteById(id);
    }

    private List<String> asStringList(Object o) {
        if (o instanceof List) {
            List<String> r = new ArrayList<>();
            for (Object x : (List<?>) o) r.add(x == null ? null : x.toString());
            return r;
        }
        return new ArrayList<>();
    }
}
