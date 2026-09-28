package com.cathouse.service;

import com.cathouse.common.ApiException;
import com.cathouse.config.SecurityProperties;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Base64;

/**
 * 零依赖 token：HMAC-SHA256 自签名（JDK 自带 javax.crypto，无需第三方库）。
 *
 * 格式：  base64url(openid) . 过期时间戳(ms) . base64url(HMAC签名)
 * 签名对象：前两段（openid 段 + 过期时间戳），密钥来自 cathouse.auth.secret。
 *
 * 安全性说明：签名密钥不外泄的前提下，客户端无法篡改 openid 或过期时间，
 * 与标准 JWT 的 HS256 强度一致；区别仅在于不是标准 JWT 格式。
 */
@Service
public class TokenService {

    private static final String HMAC_ALG = "HmacSHA256";

    /** 与 SecurityProperties 的默认值保持一致，用于启动时告警 */
    private static final String DEFAULT_SECRET = "cathouse-dev-secret-change-me";

    private static final Logger log = LoggerFactory.getLogger(TokenService.class);

    private final SecurityProperties props;

    public TokenService(SecurityProperties props) {
        this.props = props;
        String s = props.getSecret();
        if (s == null || s.isBlank() || DEFAULT_SECRET.equals(s)) {
            log.warn("⚠️ 正在使用默认的 token 签名密钥：任何人都能伪造任意用户的 token。"
                    + "生产环境必须设置环境变量 CATHOUSE_AUTH_SECRET。");
        }
    }

    /** 签发 token */
    public String issue(String openid) {
        long expireAt = System.currentTimeMillis() + ttlMillis();
        String payload = b64(openid) + "." + expireAt;
        return payload + "." + sign(payload);
    }

    /**
     * 校验 token 并返回其中的 openid。
     * 任何失败（格式错 / 签名不符 / 已过期）都抛 ApiException。
     */
    public String verify(String token) {
        if (token == null || token.isBlank()) {
            throw new ApiException("缺少 token");
        }
        String[] p = token.split("\\.");
        if (p.length != 3) {
            throw new ApiException("token 格式错误");
        }
        // 1) 验签（常量时间比较，防时序侧信道）
        String payload = p[0] + "." + p[1];
        byte[] expected = sign(payload).getBytes(StandardCharsets.UTF_8);
        byte[] actual = p[2].getBytes(StandardCharsets.UTF_8);
        if (!MessageDigest.isEqual(expected, actual)) {
            throw new ApiException("token 签名无效");
        }
        // 2) 验过期时间
        long expireAt;
        try {
            expireAt = Long.parseLong(p[1]);
        } catch (NumberFormatException e) {
            throw new ApiException("token 格式错误");
        }
        if (System.currentTimeMillis() > expireAt) {
            throw new ApiException("token 已过期");
        }
        // 3) 解出 openid
        try {
            return new String(Base64.getUrlDecoder().decode(p[0]), StandardCharsets.UTF_8);
        } catch (IllegalArgumentException e) {
            throw new ApiException("token 格式错误");
        }
    }

    /** 剩余有效期（毫秒），供前端/调试用 */
    public long ttlMillis() {
        return props.getTokenTtlHours() * 3600_000L;
    }

    private String sign(String payload) {
        try {
            Mac mac = Mac.getInstance(HMAC_ALG);
            mac.init(new SecretKeySpec(props.getSecret().getBytes(StandardCharsets.UTF_8), HMAC_ALG));
            byte[] raw = mac.doFinal(payload.getBytes(StandardCharsets.UTF_8));
            return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
        } catch (Exception e) {
            throw new IllegalStateException("HMAC-SHA256 不可用", e);
        }
    }

    private String b64(String s) {
        return Base64.getUrlEncoder().withoutPadding().encodeToString(s.getBytes(StandardCharsets.UTF_8));
    }
}
