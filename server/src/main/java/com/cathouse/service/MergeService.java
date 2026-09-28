package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.cathouse.common.ApiException;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.MergeRequest;
import com.cathouse.entity.StrayCat;
import com.cathouse.mapper.MergeRequestMapper;
import com.cathouse.mapper.StrayCatMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@SuppressWarnings("unchecked")
@Service
public class MergeService {

    private final MergeRequestMapper mergeRequestMapper;
    private final StrayCatMapper strayCatMapper;

    public MergeService(MergeRequestMapper mergeRequestMapper, StrayCatMapper strayCatMapper) {
        this.mergeRequestMapper = mergeRequestMapper;
        this.strayCatMapper = strayCatMapper;
    }

    public String create(String openid, String fromCatId, String toCatId, String note) {
        StrayCat from = strayCatMapper.selectById(fromCatId);
        StrayCat to = strayCatMapper.selectById(toCatId);
        if (from == null || to == null) throw new ApiException("猫不存在");
        MergeRequest r = new MergeRequest();
        r.setId(UUID.randomUUID().toString());
        r.setFromCatId(fromCatId);
        r.setFromCatName(from.getName());
        r.setFromUserId(from.getCreatorId());
        r.setToCatId(toCatId);
        r.setToCatName(to.getName());
        r.setToUserId(to.getCreatorId());
        r.setApplicantId(openid);
        r.setStatus("pending");
        r.setNote(note == null ? "疑似同一只猫" : note);
        r.setCreateTime(LocalDateTime.now());
        mergeRequestMapper.insert(r);
        return r.getId();
    }

    public String approve(String openid, String requestId) {
        MergeRequest req = mergeRequestMapper.selectById(requestId);
        if (req == null || !"pending".equals(req.getStatus())) throw new ApiException("该申请已处理");
        StrayCat from = strayCatMapper.selectById(req.getFromCatId());
        StrayCat to = strayCatMapper.selectById(req.getToCatId());
        if (from == null || to == null) throw new ApiException("猫不存在");
        // 越权校验：只有被合并目标档案（toCat）的创建者能审核，避免任何人审批别人的档案
        if (openid == null || to.getCreatorId() == null || !openid.equals(to.getCreatorId())) {
            throw new ApiException("仅「" + (to.getName() == null ? "目标猫咪" : to.getName()) + "」档案的创建者可审核该申请");
        }

        long fromTime = toMillis(from.getLastSeenTime());
        long toTime = toMillis(to.getLastSeenTime());
        StrayCat mainCat = (fromTime <= toTime) ? from : to;
        StrayCat subCat = (fromTime <= toTime) ? to : from;

        List<String> aliases = new ArrayList<>(mainCat.getAliases() == null ? new ArrayList<>() : mainCat.getAliases());
        if (mainCat.getName() != null && !aliases.contains(mainCat.getName())) aliases.add(mainCat.getName());
        List<String> allPhotos = new ArrayList<>(mainCat.getPhotos() == null ? new ArrayList<>() : mainCat.getPhotos());
        if (subCat.getPhotos() != null) allPhotos.addAll(subCat.getPhotos());

        List<Map<String, Object>> mergeChain = new ArrayList<>(mainCat.getMergeChain() == null ? new ArrayList<>() : mainCat.getMergeChain());
        Map<String, Object> chainItem = new HashMap<>();
        chainItem.put("merge_id", requestId);
        chainItem.put("cat_id", subCat.getId());
        chainItem.put("cat_name", subCat.getName());
        chainItem.put("merged_by_id", openid);
        chainItem.put("merged_by_name", "管理员");
        chainItem.put("merged_time", new java.sql.Timestamp(System.currentTimeMillis()).toLocalDateTime().toString());
        mergeChain.add(chainItem);
        mainCat.setAliases(aliases);
        mainCat.setPhotos(allPhotos);
        mainCat.setMergeChain(mergeChain);
        mainCat.setUpdateTime(LocalDateTime.now());
        strayCatMapper.updateById(mainCat);

        subCat.setStatus("merged");
        subCat.setMergedInto(mainCat.getId());
        subCat.setUpdateTime(LocalDateTime.now());
        strayCatMapper.updateById(subCat);

        req.setStatus("approved");
        req.setApprovedById(openid);
        req.setApprovedTime(LocalDateTime.now());
        mergeRequestMapper.updateById(req);
        return mainCat.getId();
    }

    public void reject(String openid, String requestId, String reason) {
        MergeRequest req = mergeRequestMapper.selectById(requestId);
        if (req == null) throw new ApiException("申请不存在");
        if (!"pending".equals(req.getStatus())) throw new ApiException("该申请已处理");
        // 越权校验：与 approve 一致，只有目标档案创建者能处理
        StrayCat to = strayCatMapper.selectById(req.getToCatId());
        if (to != null) {
            if (openid == null || to.getCreatorId() == null || !openid.equals(to.getCreatorId())) {
                throw new ApiException("仅「" + (to.getName() == null ? "目标猫咪" : to.getName()) + "」档案的创建者可审核该申请");
            }
        }
        req.setStatus("rejected");
        req.setRejectedById(openid);
        req.setRejectReason(reason == null ? "" : reason);
        mergeRequestMapper.updateById(req);
    }

    public List<Map<String, Object>> list(String status, String userId) {
        QueryWrapper<MergeRequest> qw = new QueryWrapper<>();
        if (status != null && !status.isBlank()) qw.eq("status", status);
        if (userId != null && !userId.isBlank()) {
            qw.and(w -> w.eq("from_user_id", userId).or().eq("to_user_id", userId));
        }
        qw.orderByDesc("create_time").last("LIMIT 50");
        return FieldUtils.toClientList(mergeRequestMapper.selectList(qw));
    }

    private long toMillis(LocalDateTime t) {
        return t == null ? 0 : java.sql.Timestamp.valueOf(t).getTime();
    }
}
