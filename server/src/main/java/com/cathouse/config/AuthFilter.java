package com.cathouse.config;

import com.cathouse.common.ApiException;
import com.cathouse.common.Result;
import com.cathouse.service.TokenService;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ReadListener;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletInputStream;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletRequestWrapper;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StreamUtils;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.BufferedReader;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStreamReader;
import java.nio.charset.Charset;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * 接口鉴权过滤器（温和方案：不改任何 Controller）。
 *
 * 规则：
 *   1. 除白名单外，请求必须带有效 token（Authorization: Bearer <token>），否则 401
 *   2. token 校验通过后拿到其中的 openid
 *   3. 若请求参数（query 或 JSON body）里带了 openid，必须与 token 内的 openid 一致，否则 403
 *      —— 这一条挡住「拿自己的 token + 别人的 openid」冒用身份
 *   4. 校验通过后把 openid 放进 request 属性，Controller 需要时可直接取
 *
 * 白名单：登录接口、已上传的静态图片（<image src> 不带 header）、错误页、CORS 预检。
 */
@Component
@Order(Ordered.LOWEST_PRECEDENCE - 100)
public class AuthFilter extends OncePerRequestFilter {

    /** 无需 token 的路径前缀 */
    private static final String[] WHITELIST = {
            "/api/auth/login",
            "/uploads/",
            "/error",
    };

    public static final String ATTR_OPENID = "authOpenid";

    private final TokenService tokenService;
    private final ObjectMapper objectMapper = new ObjectMapper();

    public AuthFilter(TokenService tokenService) {
        this.tokenService = tokenService;
    }

    @Override
    protected boolean shouldNotFilter(HttpServletRequest request) {
        // CORS 预检不带自定义头，直接放行
        if ("OPTIONS".equalsIgnoreCase(request.getMethod())) {
            return true;
        }
        String path = request.getRequestURI();
        if (path == null) {
            return true;
        }
        for (String prefix : WHITELIST) {
            if (path.startsWith(prefix)) {
                return true;
            }
        }
        return false;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain chain) throws ServletException, IOException {
        HttpServletRequest req = request;
        String jsonBody = null;

        // JSON 请求需要读取 body 才能比对 openid。
        // ⚠️ 不能用 ContentCachingRequestWrapper：它只「记录」已读内容、不重放，
        //    一旦这里先读完，Controller 的 @RequestBody 就会报 Required request body is missing。
        //    所以用自己的包装类，把 body 字节缓存起来并允许重复读。
        String contentType = request.getContentType();
        if (contentType != null && contentType.toLowerCase(Locale.ROOT).contains("application/json")) {
            CachedBodyRequestWrapper wrapped = new CachedBodyRequestWrapper(request);
            jsonBody = new String(wrapped.getCachedBody(), StandardCharsets.UTF_8);
            req = wrapped;
        }

        // ① 校验 token
        String token = extractToken(req);
        String tokenOpenid;
        try {
            tokenOpenid = tokenService.verify(token);
        } catch (ApiException e) {
            writeError(response, 401, "未登录或登录已失效（" + e.getMessage() + "）");
            return;
        }

        // ② 比对请求里的 openid
        String queryOpenid = req.getParameter("openid");
        String bodyOpenid = extractJsonOpenid(jsonBody);
        if (queryOpenid != null && !queryOpenid.isBlank() && !queryOpenid.equals(tokenOpenid)) {
            writeError(response, 403, "无权操作其他用户的数据（query openid 与 token 不符）");
            return;
        }
        if (bodyOpenid != null && !bodyOpenid.isBlank() && !bodyOpenid.equals(tokenOpenid)) {
            writeError(response, 403, "无权操作其他用户的数据（body openid 与 token 不符）");
            return;
        }

        req.setAttribute(ATTR_OPENID, tokenOpenid);
        chain.doFilter(req, response);
    }

    /** 支持 "Bearer <token>" 与裸 token 两种写法 */
    private String extractToken(HttpServletRequest request) {
        String header = request.getHeader("Authorization");
        if (header == null || header.isBlank()) {
            return null;
        }
        String v = header.trim();
        if (v.regionMatches(true, 0, "Bearer ", 0, 7)) {
            return v.substring(7).trim();
        }
        return v;
    }

    /** 从 JSON body 里取 openid 字段；解析失败或非对象则返回 null（不阻塞请求） */
    private String extractJsonOpenid(String jsonBody) {
        if (jsonBody == null || jsonBody.isBlank()) {
            return null;
        }
        try {
            JsonNode node = objectMapper.readTree(jsonBody);
            JsonNode v = node.get("openid");
            return v == null || v.isNull() ? null : v.asText();
        } catch (Exception e) {
            return null;
        }
    }

    private void writeError(HttpServletResponse response, int status, String message) throws IOException {
        response.setStatus(status);
        response.setContentType(MediaType.APPLICATION_JSON_VALUE);
        response.setCharacterEncoding(StandardCharsets.UTF_8.name());
        response.getWriter().write(objectMapper.writeValueAsString(Result.fail(status, message)));
    }

    // ==================== 可重复读取 body 的 request 包装 ====================

    /**
     * 把请求体一次性读进内存并允许重复读取。
     * 仅用于 JSON 请求（multipart 上传不包装，避免大文件进内存、破坏文件解析）。
     */
    private static class CachedBodyRequestWrapper extends HttpServletRequestWrapper {

        private final byte[] cachedBody;

        CachedBodyRequestWrapper(HttpServletRequest request) throws IOException {
            super(request);
            this.cachedBody = StreamUtils.copyToByteArray(request.getInputStream());
        }

        byte[] getCachedBody() {
            return cachedBody;
        }

        @Override
        public ServletInputStream getInputStream() {
            return new CachedBodyInputStream(cachedBody);
        }

        @Override
        public BufferedReader getReader() {
            String enc = getCharacterEncoding();
            Charset cs = StandardCharsets.UTF_8;
            if (enc != null && !enc.isBlank()) {
                try {
                    cs = Charset.forName(enc);
                } catch (Exception ignored) {
                    // 非法编码名时退回 UTF-8
                }
            }
            return new BufferedReader(new InputStreamReader(getInputStream(), cs));
        }
    }

    private static class CachedBodyInputStream extends ServletInputStream {

        private final ByteArrayInputStream in;

        CachedBodyInputStream(byte[] body) {
            this.in = new ByteArrayInputStream(body);
        }

        @Override
        public int read() {
            return in.read();
        }

        @Override
        public int read(byte[] b, int off, int len) {
            return in.read(b, off, len);
        }

        @Override
        public int available() {
            return in.available();
        }

        @Override
        public boolean isFinished() {
            return in.available() == 0;
        }

        @Override
        public boolean isReady() {
            return true;
        }

        @Override
        public void setReadListener(ReadListener readListener) {
            throw new UnsupportedOperationException("setReadListener 不支持");
        }
    }
}
