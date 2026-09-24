package com.cathouse.service;

import com.baomidou.mybatisplus.core.conditions.query.QueryWrapper;
import com.baomidou.mybatisplus.extension.plugins.pagination.Page;
import com.cathouse.common.ApiException;
import com.cathouse.common.FieldUtils;
import com.cathouse.entity.*;
import com.cathouse.mapper.*;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.*;
import java.util.stream.Collectors;

@SuppressWarnings("unchecked")
@Service
public class CrowdService {

    private final CrowdfundingMapper crowdfundingMapper;
    private final CrowdLikeMapper crowdLikeMapper;
    private final CrowdCommentMapper crowdCommentMapper;
    private final UserMapper userMapper;
    private final NotifyService notifyService;

    public CrowdService(CrowdfundingMapper crowdfundingMapper, CrowdLikeMapper crowdLikeMapper,
                        CrowdCommentMapper crowdCommentMapper, UserMapper userMapper,
                        NotifyService notifyService) {
        this.crowdfundingMapper = crowdfundingMapper;
        this.crowdLikeMapper = crowdLikeMapper;
        this.crowdCommentMapper = crowdCommentMapper;
        this.userMapper = userMapper;
        this.notifyService = notifyService;
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
        c.setLikeCount(0);
        c.setCommentCount(0);
        c.setDeadline(toLocalDateTime(cd.get("deadline")));
        c.setCreateTime(LocalDateTime.now());
        c.setUpdateTime(LocalDateTime.now());
        crowdfundingMapper.insert(c);
        return c.getId();
    }

    public Map<String, Object> list(String status, long page, long pageSize, String openid) {
        QueryWrapper<Crowdfunding> qw = new QueryWrapper<>();
        if (status != null && !status.isBlank()) qw.eq("status", status);
        qw.orderByDesc("create_time");
        Page<Crowdfunding> p = crowdfundingMapper.selectPage(new Page<>(page + 1, pageSize), qw);
        List<Crowdfunding> records = p.getRecords();
        Set<String> liked = likedCrowdIds(records, openid);
        List<Map<String, Object>> data = records.stream().map(c -> {
            Map<String, Object> m = FieldUtils.clientMap(c);
            m.put("isLiked", liked.contains(c.getId()));
            return m;
        }).collect(Collectors.toList());
        return Map.of("data", data, "total", (int) p.getTotal());
    }

    public Map<String, Object> detail(String crowdId, String openid) {
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        Map<String, Object> m = FieldUtils.clientMap(c);
        m.put("isLiked", isLiked(crowdId, openid));
        return m;
    }

    // ---------- 点赞 ----------
    public void like(String openid, String crowdId) {
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        QueryWrapper<CrowdLike> qw = new QueryWrapper<>();
        qw.eq("crowd_id", crowdId).eq("user_id", openid);
        if (crowdLikeMapper.selectCount(qw) > 0) return;
        CrowdLike like = new CrowdLike();
        like.setId(UUID.randomUUID().toString());
        like.setCrowdId(crowdId);
        like.setUserId(openid);
        like.setCreateTime(LocalDateTime.now());
        crowdLikeMapper.insert(like);
        c.setLikeCount((c.getLikeCount() == null ? 0 : c.getLikeCount()) + 1);
        crowdfundingMapper.updateById(c);
        // 发起人自己点赞自己的众筹也记录；重复点赞去重由 NotifyService 负责
        if (c.getInitiatorId() != null) {
            User sender = userMapper.selectById(openid);
            notifyService.createNotification(c.getInitiatorId(), openid,
                    sender != null ? sender.getNickName() : "匿名用户",
                    sender != null ? sender.getAvatarUrl() : "",
                    "like", null, crowdId, crowdSnippet(c), null, 0);
        }
    }

    public void unlike(String openid, String crowdId) {
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        QueryWrapper<CrowdLike> qw = new QueryWrapper<>();
        qw.eq("crowd_id", crowdId).eq("user_id", openid);
        CrowdLike like = crowdLikeMapper.selectOne(qw);
        if (like != null) crowdLikeMapper.deleteById(like.getId());
        notifyService.removeLikeNotification(openid, null, crowdId);
        c.setLikeCount(Math.max(0, (c.getLikeCount() == null ? 1 : c.getLikeCount()) - 1));
        crowdfundingMapper.updateById(c);
    }

    // ---------- 评论 ----------
    public Map<String, Object> addComment(String openid, String crowdId, String content, String parentId) {
        if (content == null || content.trim().isEmpty()) throw new ApiException("评论内容不能为空");
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");
        User u = userMapper.selectById(openid);
        String nick = u != null && u.getNickName() != null ? u.getNickName() : "匿名用户";
        String avatar = u != null && u.getAvatarUrl() != null ? u.getAvatarUrl() : "";
        CrowdComment cm = new CrowdComment();
        cm.setId(UUID.randomUUID().toString());
        cm.setCrowdId(crowdId);
        cm.setContent(content.trim());
        cm.setAuthorId(openid);
        cm.setAuthorName(nick);
        cm.setAuthorAvatar(avatar);
        cm.setParentId(parentId);
        cm.setLikeCount(0);
        cm.setCreateTime(LocalDateTime.now());
        crowdCommentMapper.insert(cm);
        c.setCommentCount((c.getCommentCount() == null ? 0 : c.getCommentCount()) + 1);
        crowdfundingMapper.updateById(c);
        if (c.getInitiatorId() != null) {
            notifyService.createNotification(c.getInitiatorId(), openid, nick, avatar, "comment",
                    null, crowdId, crowdSnippet(c),
                    content.trim().substring(0, Math.min(100, content.trim().length())), 0);
        }
        Map<String, Object> m = FieldUtils.clientMap(cm);
        m.put("isAuthor", true);
        return Map.of("data", m);
    }

    public Map<String, Object> listComments(String crowdId, long page, long pageSize, String openid) {
        QueryWrapper<CrowdComment> qw = new QueryWrapper<>();
        qw.eq("crowd_id", crowdId).isNull("parent_id").orderByDesc("create_time")
                .last("LIMIT " + pageSize + " OFFSET " + (page * pageSize));
        List<CrowdComment> tops = crowdCommentMapper.selectList(qw);
        List<Map<String, Object>> data = new ArrayList<>();
        for (CrowdComment c : tops) {
            Map<String, Object> m = FieldUtils.clientMap(c);
            QueryWrapper<CrowdComment> rqw = new QueryWrapper<>();
            rqw.eq("parent_id", c.getId()).orderByAsc("create_time").last("LIMIT 2");
            List<CrowdComment> replies = crowdCommentMapper.selectList(rqw);
            long replyCount = crowdCommentMapper.selectCount(new QueryWrapper<CrowdComment>().eq("parent_id", c.getId()));
            m.put("replyCount", replyCount);
            m.put("replies", FieldUtils.toClientList(replies));
            m.put("isAuthor", openid != null && openid.equals(c.getAuthorId()));
            data.add(m);
        }
        return Map.of("data", data);
    }

    public Map<String, Object> listReplies(String commentId) {
        QueryWrapper<CrowdComment> qw = new QueryWrapper<>();
        qw.eq("parent_id", commentId).orderByAsc("create_time").last("LIMIT 50");
        return Map.of("data", FieldUtils.toClientList(crowdCommentMapper.selectList(qw)));
    }

    public void deleteComment(String openid, String commentId) {
        CrowdComment c = crowdCommentMapper.selectById(commentId);
        if (c == null) throw new ApiException("评论不存在");
        if (!openid.equals(c.getAuthorId())) throw new ApiException("无权删除");
        crowdCommentMapper.deleteById(commentId);
        Crowdfunding cf = crowdfundingMapper.selectById(c.getCrowdId());
        if (cf == null) return;
        int dec = 1;
        if (c.getParentId() == null) {
            QueryWrapper<CrowdComment> rqw = new QueryWrapper<>();
            rqw.eq("parent_id", commentId);
            List<CrowdComment> replies = crowdCommentMapper.selectList(rqw);
            for (CrowdComment r : replies) crowdCommentMapper.deleteById(r.getId());
            dec += replies == null ? 0 : replies.size();
        }
        cf.setCommentCount(Math.max(0, (cf.getCommentCount() == null ? 0 : cf.getCommentCount()) - dec));
        crowdfundingMapper.updateById(cf);
    }

    // ---------- 辅助 ----------

    /** 众筹写入通知时的摘要（目标被删除后作为兜底文案）：猫名 · 描述。 */
    private static String crowdSnippet(Crowdfunding c) {
        String name = c.getCatName() == null ? "" : c.getCatName().trim();
        String desc = c.getDescription() == null ? "" : c.getDescription().trim();
        String s = name.isEmpty() ? desc : (desc.isEmpty() ? name : name + " · " + desc);
        return s.substring(0, Math.min(50, s.length()));
    }

    private boolean isLiked(String crowdId, String openid) {
        if (crowdId == null || openid == null) return false;
        QueryWrapper<CrowdLike> qw = new QueryWrapper<>();
        qw.eq("crowd_id", crowdId).eq("user_id", openid);
        return crowdLikeMapper.selectCount(qw) > 0;
    }

    private Set<String> likedCrowdIds(List<Crowdfunding> records, String openid) {
        if (records.isEmpty() || openid == null) return Collections.emptySet();
        List<String> ids = records.stream().map(Crowdfunding::getId).collect(Collectors.toList());
        QueryWrapper<CrowdLike> qw = new QueryWrapper<>();
        qw.in("crowd_id", ids).eq("user_id", openid);
        return crowdLikeMapper.selectList(qw).stream().map(CrowdLike::getCrowdId).collect(Collectors.toSet());
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
