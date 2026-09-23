package com.cathouse.common;

import lombok.Data;

@Data
public class WxSession {
    private String openid;
    private String sessionKey;
    private String unionid;
    private Integer errcode;
    private String errmsg;
}
