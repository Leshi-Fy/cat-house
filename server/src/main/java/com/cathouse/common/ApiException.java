package com.cathouse.common;

/**
 * 业务异常：直接带一句给用户看的消息（对应 Deno 里 return { error: '...' }）。
 */
public class ApiException extends RuntimeException {
    public ApiException(String message) {
        super(message);
    }
}
