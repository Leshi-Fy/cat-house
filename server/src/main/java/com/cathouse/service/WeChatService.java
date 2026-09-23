package com.cathouse.service;

import com.cathouse.common.ApiException;
import com.cathouse.common.WxSession;
import com.cathouse.config.WeChatProperties;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestTemplate;

/**
 * 微信登录：jscode2session 换取 openid / session_key。
 */
@Service
public class WeChatService {

    private final WeChatProperties props;
    private final RestTemplate restTemplate = new RestTemplate();
    private final ObjectMapper objectMapper = new ObjectMapper();

    public WeChatService(WeChatProperties props) {
        this.props = props;
    }

    public WxSession jscode2session(String code) {
        if (code == null || code.isBlank()) {
            throw new ApiException("缺少 code");
        }
        if (props.getAppid() == null || props.getSecret() == null
                || "YOUR_WECHAT_SECRET".equals(props.getSecret())) {
            throw new ApiException("未配置微信 AppID/Secret");
        }
        String url = "https://api.weixin.qq.com/sns/jscode2session"
                + "?appid=" + props.getAppid()
                + "&secret=" + props.getSecret()
                + "&js_code=" + code
                + "&grant_type=authorization_code";
        String json = restTemplate.getForObject(url, String.class);
        try {
            JsonNode node = objectMapper.readTree(json);
            WxSession s = new WxSession();
            if (node.has("errcode") && node.get("errcode").asInt() != 0) {
                s.setErrcode(node.get("errcode").asInt());
                s.setErrmsg(node.has("errmsg") ? node.get("errmsg").asText() : "未知错误");
                throw new ApiException("微信登录失败: " + s.getErrmsg());
            }
            s.setOpenid(node.get("openid").asText());
            s.setSessionKey(node.has("session_key") ? node.get("session_key").asText() : null);
            s.setUnionid(node.has("unionid") ? node.get("unionid").asText() : null);
            return s;
        } catch (ApiException e) {
            throw e;
        } catch (Exception e) {
            throw new ApiException("微信登录解析失败");
        }
    }
}
