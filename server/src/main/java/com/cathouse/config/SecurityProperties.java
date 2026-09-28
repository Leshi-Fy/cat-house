package com.cathouse.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 鉴权配置。
 *
 * ⚠️ 生产必须设置环境变量 CATHOUSE_AUTH_SECRET 覆盖签名密钥，
 *    否则用的就是这个默认值 —— 任何人拿到默认值都能伪造任意用户的 token。
 */
@Data
@Component
@ConfigurationProperties(prefix = "cathouse.auth")
public class SecurityProperties {

    /** token 签名密钥（HMAC-SHA256） */
    private String secret = "cathouse-dev-secret-change-me";

    /** token 有效期（小时），默认 720 = 30 天 */
    private long tokenTtlHours = 720;
}
