package com.cathouse.service;

import com.cathouse.common.ApiException;
import com.cathouse.config.FileProperties;
import org.springframework.stereotype.Service;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.UUID;

/**
 * 文件上传：保存到本地目录，返回可被前端直接访问的完整 URL。
 * 对应 Deno 的 uploadAction —— 但不再依赖 Supabase Storage，图片存本地 + 静态资源服务。
 */
@Service
public class UploadService {

    private final FileProperties fileProperties;

    public UploadService(FileProperties fileProperties) {
        this.fileProperties = fileProperties;
    }

    public String store(MultipartFile file) {
        if (file == null || file.isEmpty()) throw new ApiException("missing file");
        String original = file.getOriginalFilename();
        String ext = "";
        if (original != null && original.contains(".")) {
            ext = original.substring(original.lastIndexOf('.'));
            if (ext.length() > 10) ext = ".jpg";
        } else {
            ext = ".jpg";
        }
        String dateDir = new java.text.SimpleDateFormat("yyyyMMdd").format(new java.util.Date());
        String fileName = UUID.randomUUID().toString().replace("-", "") + ext;
        Path dir = Paths.get(fileProperties.getUploadDir(), dateDir).toAbsolutePath().normalize();
        try {
            Files.createDirectories(dir);
            Path target = dir.resolve(fileName);
            file.transferTo(target.toFile());
        } catch (IOException e) {
            throw new ApiException("文件保存失败：" + e.getMessage());
        }
        // 拼前端可访问 URL：base-url + url-prefix + 相对路径（统一用 /）
        String prefix = fileProperties.getUrlPrefix();
        String rel = "/" + dateDir + "/" + fileName;
        return fileProperties.getBaseUrl() + prefix + rel;
    }
}
