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
    private final WalletService walletService;

    /** 管理员 openid 白名单（逗号分隔），仅这些人能审核报销申请。配置：cathouse.admin.openids */
    @org.springframework.beans.factory.annotation.Value("${cathouse.admin.openids:}")
    private String adminOpenids;

    public CrowdService(CrowdfundingMapper crowdfundingMapper, CrowdLikeMapper crowdLikeMapper,
                        CrowdCommentMapper crowdCommentMapper, UserMapper userMapper,
                        NotifyService notifyService, WalletService walletService) {
        this.crowdfundingMapper = crowdfundingMapper;
        this.crowdLikeMapper = crowdLikeMapper;
        this.crowdCommentMapper = crowdCommentMapper;
        this.userMapper = userMapper;
        this.notifyService = notifyService;
        this.walletService = walletService;
    }

    // ---------- 报销余额（单位：分） ----------
    /** 指定状态的报销总额 */
    private int receiptSum(Crowdfunding c, String status) {
        List<Map<String, Object>> rs = c.getReceiptRecords();
        if (rs == null) return 0;
        int s = 0;
        for (Map<String, Object> r : rs) {
            if (r == null || !status.equals(String.valueOf(r.get("status")))) continue;
            s += toInt(r.get("amount"), 0);
        }
        return s;
    }

    /** 已报销（审核通过）金额 */
    public int reimbursedAmount(Crowdfunding c) {
        return receiptSum(c, "approved");
    }

    /** 审核中冻结的金额 */
    public int frozenAmount(Crowdfunding c) {
        return receiptSum(c, "pending");
    }

    /**
     * 可报销余额 = 已筹金额 − 已报销 − 审核中冻结。
     * 审核中的申请也要占额度，否则两笔同时申请、先后通过就会超支。
     */
    public int availableBalance(Crowdfunding c) {
        int raised = c.getRaisedAmount() == null ? 0 : c.getRaisedAmount();
        return raised - reimbursedAmount(c) - frozenAmount(c);
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
        putBalance(m, c);
        return m;
    }

    /** 往返回体里补余额字段（分 + 元的展示串都给，前端不用自己换算） */
    private void putBalance(Map<String, Object> m, Crowdfunding c) {
        int reimbursed = reimbursedAmount(c);
        int frozen = frozenAmount(c);
        int available = availableBalance(c);
        m.put("reimbursedAmount", reimbursed);
        m.put("frozenAmount", frozen);
        m.put("availableBalance", available);
        m.put("availableBalanceText", "¥" + WalletService.fen2yuan(available));
        m.put("reimbursedAmountText", "¥" + WalletService.fen2yuan(reimbursed));
        m.put("frozenAmountText", "¥" + WalletService.fen2yuan(frozen));
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
        int amt = amount == null ? 0 : amount;
        if (amt <= 0) throw new ApiException("报销金额必须大于 0");

        // 余额校验（后端兜底，前端拦不住并发）：可用 = 已筹 − 已报销 − 审核中冻结
        int available = availableBalance(c);
        if (amt > available) {
            throw new ApiException("可报销余额不足：当前可用 ¥" + WalletService.fen2yuan(available)
                    + "，本次申请 ¥" + WalletService.fen2yuan(amt));
        }

        List<Map<String, Object>> records = c.getReceiptRecords() == null ? new ArrayList<>() : new ArrayList<>(c.getReceiptRecords());
        Map<String, Object> record = new HashMap<>();
        record.put("_id", crowdId + "_" + System.currentTimeMillis());
        record.put("status", "pending");
        record.put("amount", amt);
        record.put("remark", remark == null ? "" : remark);
        record.put("receipts", receipts == null ? new ArrayList<>() : receipts);
        record.put("create_time", new java.sql.Timestamp(System.currentTimeMillis()).toLocalDateTime().toString());
        records.add(record);
        c.setReceiptRecords(records);
        c.setReceiptStatus("pending");
        c.setUpdateTime(LocalDateTime.now());
        crowdfundingMapper.updateById(c);
    }

    /**
     * 审核报销申请（管理员）。
     * 通过后：金额从众筹额度中扣除（记为已报销），并转入发起人钱包，由发起人自行提现。
     */
    public void approveReceipt(String openid, String crowdId, String receiptId, boolean approved) {
        requireAdmin(openid);
        Crowdfunding c = crowdfundingMapper.selectById(crowdId);
        if (c == null) throw new ApiException("众筹不存在");

        List<Map<String, Object>> records = c.getReceiptRecords() == null ? new ArrayList<>() : new ArrayList<>(c.getReceiptRecords());
        Map<String, Object> target = null;
        if (receiptId != null && !receiptId.isBlank()) {
            for (Map<String, Object> r : records) {
                if (r != null && receiptId.equals(String.valueOf(r.get("_id")))) { target = r; break; }
            }
        }
        if (target == null) throw new ApiException("报销申请不存在");
        if (!"pending".equals(String.valueOf(target.get("status")))) throw new ApiException("该申请已处理");

        int amt = toInt(target.get("amount"), 0);

        if (approved) {
            // 通过前二次校验：期间可能已有其它申请通过/金额变化，不够就直接拒绝
            // 本笔自身是 pending（已计入冻结），所以比对时要把自己加回可用额度
            int availableWithSelf = availableBalance(c) + amt;
            if (amt > availableWithSelf) {
                throw new ApiException("可报销余额不足：当前可用 ¥" + WalletService.fen2yuan(availableWithSelf)
                        + "，无法通过 ¥" + WalletService.fen2yuan(amt) + " 的报销");
            }
            target.put("status", "approved");
            target.put("approved_by", openid);
            target.put("approved_time", new java.sql.Timestamp(System.currentTimeMillis()).toLocalDateTime().toString());
            // 转入发起人钱包（幂等：同 receiptId 只入账一次）
            walletService.creditReimbursement(c.getInitiatorId(), crowdId, String.valueOf(target.get("_id")), amt,
                    "众筹报销：" + (c.getCatName() == null ? "猫咪救助" : c.getCatName()));
            notifyService.createNotification(c.getInitiatorId(), openid, "平台管理员", "",
                    "system", null, crowdId,
                    "你提交的报销申请已通过，¥" + WalletService.fen2yuan(amt) + " 已转入钱包，可前往钱包提现",
                    null, amt);
        } else {
            target.put("status", "rejected");
            target.put("approved_by", openid);
            target.put("approved_time", new java.sql.Timestamp(System.currentTimeMillis()).toLocalDateTime().toString());
            notifyService.createNotification(c.getInitiatorId(), openid, "平台管理员", "",
                    "system", null, crowdId,
                    "你提交的报销申请未通过，请查看发票与说明后重新提交",
                    null, amt);
        }

        c.setReceiptRecords(records);
        // 整体状态：还有 pending 就是审核中，否则取最后一条的结果
        boolean hasPending = records.stream().anyMatch(r -> r != null && "pending".equals(String.valueOf(r.get("status"))));
        c.setReceiptStatus(hasPending ? "pending" : (approved ? "approved" : "rejected"));
        c.setUpdateTime(LocalDateTime.now());
        crowdfundingMapper.updateById(c);
    }

    public void requireAdmin(String openid) {
        if (openid == null || openid.isBlank()) throw new ApiException("未登录");
        if (adminOpenids == null || adminOpenids.isBlank()) throw new ApiException("未配置管理员，请联系平台");
        for (String id : adminOpenids.split(",")) {
            if (openid.equals(id.trim())) return;
        }
        throw new ApiException("仅管理员可审核报销申请");
    }

    /** 当前用户是否为报销审核管理员 */
    public boolean isAdmin(String openid) {
        if (openid == null || openid.isBlank() || adminOpenids == null || adminOpenids.isBlank()) return false;
        for (String id : adminOpenids.split(",")) {
            if (openid.equals(id.trim())) return true;
        }
        return false;
    }

    /** 管理后台：列出所有「审核中」的报销申请（跨全部众筹） */
    public List<Map<String, Object>> listPendingReceipts() {
        QueryWrapper<Crowdfunding> qw = new QueryWrapper<>();
        qw.isNotNull("receipt_records").orderByDesc("update_time").last("LIMIT 300");
        List<Crowdfunding> all = crowdfundingMapper.selectList(qw);
        List<Map<String, Object>> out = new ArrayList<>();
        for (Crowdfunding c : all) {
            List<Map<String, Object>> rs = c.getReceiptRecords();
            if (rs == null) continue;
            for (Map<String, Object> r : rs) {
                if (r != null && "pending".equals(String.valueOf(r.get("status")))) {
                    Map<String, Object> item = new LinkedHashMap<>();
                    item.put("crowdId", c.getId());
                    item.put("crowdName", c.getCatName());
                    item.put("initiatorName", c.getInitiatorName());
                    item.put("raisedAmount", c.getRaisedAmount() == null ? 0 : c.getRaisedAmount());
                    item.put("availableBalance", availableBalance(c));
                    item.put("receipt", r);
                    out.add(item);
                }
            }
        }
        return out;
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
