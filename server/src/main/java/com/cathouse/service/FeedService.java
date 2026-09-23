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
public class FeedService {

    private final FeedMapper feedMapper;
    private final FeedLikeMapper feedLikeMapper;
    private final FeedCommentMapper feedCommentMapper;
    private final UserMapper userMapper;
    private final StrayCatMapper strayCatMapper;
    private final NotifyService notifyService;

    public FeedService(FeedMapper feedMapper, FeedLikeMapper feedLikeMapper,
                       FeedCommentMapper feedCommentMapper, UserMapper userMapper,
                       StrayCatMapper strayCatMapper, NotifyService notifyService) {
        this.feedMapper = feedMapper;
        this.feedLikeMapper = feedLikeMapper;
        this.feedCommentMapper = feedCommentMapper;
        this.userMapper = userMapper;
        this.strayCatMapper = strayCatMapper;
        this.notifyService = notifyService;
    }

    public String create(String openid, String content, List<String> photos, String catId) {
        User u = userMapper.selectById(openid);
        String nick = u != null && u.getNickName() != null ? u.getNickName() : "匿名用户";
        String avatar = u != null && u.getAvatarUrl() != null ? u.getAvatarUrl() : "";
        Feed feed = new Feed();
        feed.setId(UUID.randomUUID().toString());
        feed.setContent(content);
        feed.setPhotos(photos == null ? new ArrayList<>() : photos);
        feed.setAuthorId(openid);
        feed.setAuthorName(nick);
        feed.setAuthorAvatar(avatar);
        feed.setCatId(catId);
        feed.setCatInfo(buildCatInfo(catId));
        feed.setLikeCount(0);
        feed.setCommentCount(0);
        feed.setCreateTime(LocalDateTime.now());
        feed.setUpdateTime(LocalDateTime.now());
        feedMapper.insert(feed);
        return feed.getId();
    }

    public Map<String, Object> list(long page, long pageSize, String openid) {
        Page<Feed> p = feedMapper.selectPage(new Page<>(page + 1, pageSize),
                new QueryWrapper<Feed>().orderByDesc("create_time"));
        List<Feed> records = p.getRecords();
        Set<String> liked = likedFeedIds(records, openid);
        List<Map<String, Object>> data = records.stream().map(f -> {
            Map<String, Object> m = FieldUtils.clientMap(f);
            m.put("isLiked", liked.contains(f.getId()));
            m.put("userName", f.getAuthorName());
            m.put("userAvatar", f.getAuthorAvatar());
            return m;
        }).collect(Collectors.toList());
        return Map.of("data", data, "total", (int) p.getTotal());
    }

    public Map<String, Object> myFeeds(String openid, long page, long pageSize) {
        Page<Feed> p = feedMapper.selectPage(new Page<>(page + 1, pageSize),
                new QueryWrapper<Feed>().eq("author_id", openid).orderByDesc("create_time"));
        List<Feed> records = p.getRecords();
        Map<String, Long> likeCountMap = likeCounts(records);
        List<Map<String, Object>> data = records.stream().map(f -> {
            Map<String, Object> m = FieldUtils.clientMap(f);
            m.put("likeCount", likeCountMap.getOrDefault(f.getId(), 0L));
            return m;
        }).collect(Collectors.toList());
        return Map.of("data", data, "total", (int) p.getTotal());
    }

    public void update(String openid, String feedId, String content, List<String> photos, String catId) {
        Feed f = feedMapper.selectById(feedId);
        if (f == null) throw new ApiException("动态不存在");
        if (!openid.equals(f.getAuthorId())) throw new ApiException("无权编辑");
        f.setContent(content);
        f.setPhotos(photos == null ? new ArrayList<>() : photos);
        f.setCatId(catId);
        f.setCatInfo(buildCatInfo(catId));
        f.setUpdateTime(LocalDateTime.now());
        feedMapper.updateById(f);
    }

    public void delete(String openid, String feedId) {
        Feed f = feedMapper.selectById(feedId);
        if (f == null) throw new ApiException("动态不存在");
        if (!openid.equals(f.getAuthorId())) throw new ApiException("无权删除");
        feedMapper.deleteById(feedId);
    }

    public void like(String openid, String feedId) {
        QueryWrapper<FeedLike> qw = new QueryWrapper<>();
        qw.eq("feed_id", feedId).eq("user_id", openid);
        if (feedLikeMapper.selectCount(qw) > 0) return;
        FeedLike like = new FeedLike();
        like.setId(UUID.randomUUID().toString());
        like.setFeedId(feedId);
        like.setUserId(openid);
        like.setCreateTime(LocalDateTime.now());
        feedLikeMapper.insert(like);
        Feed f = feedMapper.selectById(feedId);
        if (f != null) {
            f.setLikeCount((f.getLikeCount() == null ? 0 : f.getLikeCount()) + 1);
            feedMapper.updateById(f);
            if (f.getAuthorId() != null && !f.getAuthorId().equals(openid)) {
                User sender = userMapper.selectById(openid);
                notifyService.createNotification(f.getAuthorId(), openid,
                        sender != null ? sender.getNickName() : "匿名用户",
                        sender != null ? sender.getAvatarUrl() : "",
                        "like", feedId, null, (f.getContent() == null ? "" : f.getContent()).substring(0, Math.min(50, f.getContent() == null ? 0 : f.getContent().length())), null, 0);
            }
        }
    }

    public void unlike(String openid, String feedId) {
        QueryWrapper<FeedLike> qw = new QueryWrapper<>();
        qw.eq("feed_id", feedId).eq("user_id", openid);
        FeedLike like = feedLikeMapper.selectOne(qw);
        if (like != null) feedLikeMapper.deleteById(like.getId());
        Feed f = feedMapper.selectById(feedId);
        if (f != null) {
            f.setLikeCount(Math.max(0, (f.getLikeCount() == null ? 1 : f.getLikeCount()) - 1));
            feedMapper.updateById(f);
        }
    }

    public Map<String, Object> getDetail(String openid, String feedId) {
        Feed f = feedMapper.selectById(feedId);
        if (f == null) throw new ApiException("动态不存在");
        QueryWrapper<FeedLike> qw = new QueryWrapper<>();
        qw.eq("feed_id", feedId).eq("user_id", openid);
        boolean isLiked = feedLikeMapper.selectCount(qw) > 0;
        Map<String, Object> m = FieldUtils.clientMap(f);
        m.put("isLiked", isLiked);
        m.put("userName", f.getAuthorName());
        m.put("userAvatar", f.getAuthorAvatar());
        return Map.of("data", m);
    }

    public Map<String, Object> addComment(String openid, String feedId, String content, String parentId) {
        if (content == null || content.trim().isEmpty()) throw new ApiException("评论内容不能为空");
        User u = userMapper.selectById(openid);
        String nick = u != null && u.getNickName() != null ? u.getNickName() : "匿名用户";
        String avatar = u != null && u.getAvatarUrl() != null ? u.getAvatarUrl() : "";
        FeedComment c = new FeedComment();
        c.setId(UUID.randomUUID().toString());
        c.setFeedId(feedId);
        c.setContent(content.trim());
        c.setAuthorId(openid);
        c.setAuthorName(nick);
        c.setAuthorAvatar(avatar);
        c.setParentId(parentId);
        c.setLikeCount(0);
        c.setCreateTime(LocalDateTime.now());
        feedCommentMapper.insert(c);
        Feed f = feedMapper.selectById(feedId);
        if (f != null) {
            f.setCommentCount((f.getCommentCount() == null ? 0 : f.getCommentCount()) + 1);
            feedMapper.updateById(f);
            if (f.getAuthorId() != null && !f.getAuthorId().equals(openid)) {
                notifyService.createNotification(f.getAuthorId(), openid, nick, avatar, "comment",
                        feedId, null, (f.getContent() == null ? "" : f.getContent()).substring(0, Math.min(50, f.getContent() == null ? 0 : f.getContent().length())),
                        content.trim().substring(0, Math.min(100, content.trim().length())), 0);
            }
        }
        Map<String, Object> m = FieldUtils.clientMap(c);
        m.put("isAuthor", true);
        return Map.of("data", m);
    }

    public Map<String, Object> listComments(String feedId, long page, long pageSize, String openid) {
        QueryWrapper<FeedComment> qw = new QueryWrapper<>();
        qw.eq("feed_id", feedId).isNull("parent_id").orderByDesc("create_time")
                .last("LIMIT " + pageSize + " OFFSET " + (page * pageSize));
        List<FeedComment> tops = feedCommentMapper.selectList(qw);
        List<Map<String, Object>> data = new ArrayList<>();
        for (FeedComment c : tops) {
            Map<String, Object> m = FieldUtils.clientMap(c);
            QueryWrapper<FeedComment> rqw = new QueryWrapper<>();
            rqw.eq("parent_id", c.getId()).orderByAsc("create_time").last("LIMIT 2");
            List<FeedComment> replies = feedCommentMapper.selectList(rqw);
            long replyCount = feedCommentMapper.selectCount(new QueryWrapper<FeedComment>().eq("parent_id", c.getId()));
            m.put("replyCount", replyCount);
            m.put("replies", FieldUtils.toClientList(replies));
            m.put("isAuthor", openid != null && openid.equals(c.getAuthorId()));
            data.add(m);
        }
        return Map.of("data", data);
    }

    public Map<String, Object> listReplies(String commentId) {
        QueryWrapper<FeedComment> qw = new QueryWrapper<>();
        qw.eq("parent_id", commentId).orderByAsc("create_time").last("LIMIT 50");
        return Map.of("data", FieldUtils.toClientList(feedCommentMapper.selectList(qw)));
    }

    public void deleteComment(String openid, String commentId) {
        FeedComment c = feedCommentMapper.selectById(commentId);
        if (c == null) throw new ApiException("评论不存在");
        if (!openid.equals(c.getAuthorId())) throw new ApiException("无权删除");
        feedCommentMapper.deleteById(commentId);
        if (c.getParentId() == null) {
            QueryWrapper<FeedComment> rqw = new QueryWrapper<>();
            rqw.eq("parent_id", commentId);
            List<FeedComment> replies = feedCommentMapper.selectList(rqw);
            for (FeedComment r : replies) feedCommentMapper.deleteById(r.getId());
            Feed f = feedMapper.selectById(c.getFeedId());
            if (f != null) {
                int dec = 1 + (replies == null ? 0 : replies.size());
                f.setCommentCount(Math.max(0, (f.getCommentCount() == null ? 0 : f.getCommentCount()) - dec));
                feedMapper.updateById(f);
            }
        } else {
            Feed f = feedMapper.selectById(c.getFeedId());
            if (f != null) {
                f.setCommentCount(Math.max(0, (f.getCommentCount() == null ? 0 : f.getCommentCount()) - 1));
                feedMapper.updateById(f);
            }
        }
    }

    // ---------- 辅助 ----------
    private Map<String, Object> buildCatInfo(String catId) {
        if (catId == null || catId.isBlank()) return null;
        StrayCat cat = strayCatMapper.selectById(catId);
        if (cat == null) return null;
        Map<String, Object> info = new HashMap<>();
        info.put("_id", cat.getId());
        info.put("name", cat.getName());
        info.put("breed", cat.getGender());   // 原 Deno 里写的是 breed，但猫表无 breed 字段，用 gender 兜底；保持一致
        info.put("photos", cat.getPhotos() == null ? new ArrayList<>() : cat.getPhotos());
        return info;
    }

    private Set<String> likedFeedIds(List<Feed> records, String openid) {
        if (records.isEmpty() || openid == null) return Collections.emptySet();
        List<String> ids = records.stream().map(Feed::getId).collect(Collectors.toList());
        QueryWrapper<FeedLike> qw = new QueryWrapper<>();
        qw.in("feed_id", ids).eq("user_id", openid);
        return feedLikeMapper.selectList(qw).stream().map(FeedLike::getFeedId).collect(Collectors.toSet());
    }

    private Map<String, Long> likeCounts(List<Feed> records) {
        if (records.isEmpty()) return Collections.emptyMap();
        List<String> ids = records.stream().map(Feed::getId).collect(Collectors.toList());
        QueryWrapper<FeedLike> qw = new QueryWrapper<>();
        qw.in("feed_id", ids);
        Map<String, Long> map = new HashMap<>();
        for (FeedLike l : feedLikeMapper.selectList(qw)) {
            map.put(l.getFeedId(), map.getOrDefault(l.getFeedId(), 0L) + 1);
        }
        return map;
    }
}
