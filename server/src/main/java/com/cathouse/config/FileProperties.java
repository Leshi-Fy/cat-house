package com.cathouse.config;

import lombok.Data;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

@Data
@Component
@ConfigurationProperties(prefix = "cathouse.file")
public class FileProperties {
    private String uploadDir = "./uploads";
    private String baseUrl = "http://192.168.1.50:8080";
    private String urlPrefix = "/uploads";
}
