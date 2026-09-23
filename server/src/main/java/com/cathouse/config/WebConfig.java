package com.cathouse.config;

import org.springframework.context.annotation.Configuration;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.nio.file.Path;
import java.nio.file.Paths;

/**
 * 把上传目录映射成静态资源，使前端能用 http(s)://域名/uploads/xxx 直接访问图片。
 */
@Configuration
public class WebConfig implements WebMvcConfigurer {

    private final FileProperties fileProperties;

    public WebConfig(FileProperties fileProperties) {
        this.fileProperties = fileProperties;
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path dir = Paths.get(fileProperties.getUploadDir()).toAbsolutePath().normalize();
        String location = dir.toUri().toString();
        registry.addResourceHandler(fileProperties.getUrlPrefix() + "/**")
                .addResourceLocations(location.endsWith("/") ? location : location + "/");
    }
}
