package com.cathouse.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "cathouse.wechat")
public class WeChatProperties {
    private String appid;
    private String secret;
}
