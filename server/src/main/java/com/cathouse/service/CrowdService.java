package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cathouse.common.ApiException;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.Crowdfunding;
import com.cathouse.mapper.CrowdfundingMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;

@SuppressWarnings("unchecked")
@Service
public class CrowdService {

    private final CrowdfundingMapper crowdfundingMapper;

    public CrowdService(CrowdfundingMapper crowdfundingMapper) {
        this.crowdfundingMapper = crowdfundingMapper;
    }

    public String create(String openid, Map<String, Object> cd) {
        Crowdfunding c = new Crowdfunding();
        c.setId(UUID.randomUUID().toString());
        c.setCatId((String) cd.get("catId"));
        c.setCatName((String) cd.get("catName"));
        c.setCatPhoto((String) cd.get("catPhoto"));
        c.setCrowdType((String) cd.get("crowdType"));
        c.setDescription((String) cd.get("description"));
        c.setTargetAmount(toInt(cd.get("targetAmount"), 0));
        c.setPhotos(asStringList(cd.get("photos")));
        c.setInitiatorId(openid);
        c.setInitiatorName((String) cd.get("initiatorName") == null ? "匿名用户" : (String) cd.get("initiatorName"));
        c.setStatus("ongoing");
        c.setReceiptStatus("none");
        c.setReceiptRecords(new ArrayList<>());
        c.setRaisedAmount(0);
        c.setDeadline(toLocalDateTime(cd.get("deadline")));
        c.setCreateTime(LocalDateTime.now());
        c.setUpdateTime(LocalDateTime.now());
        crowdfundingMapper.insert(c);
        return c.getId();
    }

    public Map<String, Object> list(String status, long page, long pageSize) {
        QueryWrapper<Crowdfunding> qw = new QueryWrapper<>();
        if (status != null && !status.isBlank()) qw.eq("status", status);
        qw.orderByDesc("create_time");
        Page<Crowdfunding> p = crowdfundingMapper.selectPage(new Page<>(page + 1, pageSize), qw);
        return Map.of("data", FieldUtils.toClientList(p.getRecords()), "total", (int) p.getTotal());
    }

    public Map<String, Object> detail(String crowdId) {
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        return FieldUtils.clientMap(c);
    }

    public void applyReceipt(String openid, String crowdId, Integer amount, String remark, List<String> receipts) {
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        if (!openid.equals(c.getInitiatorId())) throw new ApiException("仅发起人可申请报销");
        List<Map<String, Object>> records = c.getReceiptRecords() == null ? new ArrayList<>() : new ArrayList<>(c.getReceiptRecords());
        Map<String, Object> record = new HashMap<>();
        record.put("_id", crowdId + "_" + System.currentTimeMillis());
        record.put("status", "pending");
        record.put("amount", amount == null ? 0 : amount);
        record.put("remark", remark == null ? "" : remark);
        record.put("receipts", receipts == null ? new ArrayList<>() : receipts);
        record.put("create_time", new java.sql.Timestamp(System.currentTimeMillis()).toLocalDateTime().toString());
        records.add(record);
        c.setReceiptRecords(records);
        c.setReceiptStatus("pending");
        c.setUpdateTime(LocalDateTime.now());
        crowdfundingMapper.updateById(c);
    }

    public void approveReceipt(String crowdId, boolean approved) {
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        c.setReceiptStatus(approved ? "approved" : "rejected");
        c.setUpdateTime(LocalDateTime.now());
        crowdfundingMapper.updateById(c);
    }

    public void completeCrowd(String crowdId) {
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        c.setStatus("completed");
        c.setUpdateTime(LocalDateTime.now());
        crowdfundingMapper.updateById(c);
    }

    private Integer toInt(Object o, int def) {
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

    private LocalDateTime toLocalDateTime(Object o) {
        if (o == null) return null;
        try {
            if (o instanceof Number) return new java.sql.Timestamp(((Number) o).longValue()).toLocalDateTime();
            if (o instanceof String) {
                String s = (String) o;
                if (s.contains("T")) return LocalDateTime.parse(s.substring(0, 19));
                return LocalDateTime.parse(s, java.time.format.DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss"));
            }
        } catch (Exception ignore) {
        }
        return null;
    }
}
