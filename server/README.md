# 猫屋小程序 · Java 后端（Spring Boot + MyBatis-Plus + MySQL）

标准 REST 后端，替代原 Supabase/Deno 方案。前端通过 `miniprogram/utils/api.js` 调用本服务（详见根目录 `FRONTEND_MIGRATION.md`）。

## 技术栈

- Spring Boot 3.2.1 / Java 17
- MyBatis-Plus 3.5.5
- MySQL 8（Connector/J）
- Lombok

## 快速开始

### 1. 建库

```sql
CREATE DATABASE cathouse CHARACTER SET utf8mb4;
```

然后执行 `sql/schema_mysql.sql` 建表（10 张表：用户、流浪猫、家猫、众筹、捐款、合并申请、动态、动态点赞、动态评论、通知）。

### 2. 配置（已按环境拆分）

配置按 Spring Boot profile 拆分，避免本地联调与线上用同一套硬编码：

- `application.yml` —— **公共**：端口、`MyBatis`、`Jackson`、上传目录、AppID、AppSecret 明文兜底；默认 `spring.profiles.active: dev`。
- `application-dev.yml` —— **本地 / 局域网联调**：本地 MySQL（`localhost:3306/cathouse`，`root/root`）；`file.base-url` 默认 `http://127.0.0.1:8787`（手机真机调试改本机局域网 IP，如 `192.168.1.50`）。
- `application-prod.yml` —— **线上**：云服务器 MySQL（地址/账号用环境变量 `DB_HOST` / `DB_USERNAME` / `DB_PASSWORD` 注入）；`file.base-url` 改 `https://你的已备案域名`；AppSecret 可用环境变量 `WECHAT_SECRET` 覆盖明文。

切换环境：

```bash
# 本地（默认 dev，可省）
java -jar target/cat-house-server-1.0.0.jar
# 线上
java -jar target/cat-house-server-1.0.0.jar --spring.profiles.active=prod
# 或 ENV：SPRING_PROFILES_ACTIVE=prod
```

其余项（各环境共用）：

- `cathouse.file.upload-dir` —— 上传文件保存目录（默认 `./uploads`，需保证可写）
- `cathouse.file.url-prefix` —— 静态资源路径前缀（默认 `/uploads`，与 `WebConfig` 对应）

### 3. 编译运行

> 需要 Maven 3.6.3+ 与 JDK 17。

```bash
mvn clean package -DskipTests
java -jar target/cat-house-server-1.0.0.jar
# 或开发模式
mvn spring-boot:run
```

服务默认端口 8787。HTTP 接口前缀 `/api`。

## 接口一览

资源化的标准 REST Controller（共 10 个）：

| 资源 | 路径 |
| --- | --- |
| 认证（登录） | `/api/auth/login` |
| 流浪猫 | `/api/cats`（`POST` 创建 / `GET /nearby` 附近 / `GET /my` 我的 / `GET /{id}` / `PUT /{id}`） |
| 动态 | `/api/feeds`（及 `/{id}/like`、`/{id}/comments`、`/comments/{commentId}` 等） |
| 众筹 | `/api/crowdfundings`（含 `/{id}/receipts`、`/complete`） |
| 支付 | `/api/payments/donate`（演示捐款）、`/orders`（占位）、`/wechat/callback` |
| 通知 | `/api/notifications`（含 `/unread-count`、`/read`、`/read-all`） |
| 合并申请 | `/api/merge-requests` |
| 家猫 | `/api/home-cats` |
| 用户资料 | `/api/users/me` |
| 文件上传 | `/api/upload` |
| 通用代理 | `/api/db`（兼容旧云开发数据库封装，详见 `FRONTEND_MIGRATION.md`） |

统一返回结构：`{ code, message, data }`，`code=0` 成功。

## 部署与上线注意（重要）

- **测试环境（NAS / 局域网）**：`application-dev.yml` 中 `cathouse.file.base-url` 填 `http://<本机IP>:8787`（模拟器用 `127.0.0.1`），微信开发者工具勾选「不校验合法域名」即可联调。
- **正式发布**：微信**禁止** request/uploadFile/downloadFile 合法域名填纯 IP 或 localhost，且域名必须 **ICP 备案** + 受信任 CA 签发的 **HTTPS** 证书（纯 IP 无法签发受信任证书）。因此：
  1. 准备一台大陆云服务器部署本后端（公网 IP 即真实后端）；
  2. 域名 ICP 备案 + 申请免费证书（Let's Encrypt 或云厂商）；DNS 指向云服务器 IP；
  3. `cathouse.file.base-url` 改为 `https://你的域名`；
  4. 数据库安全：生产环境建议对表开启访问控制（本骨架为内联调便捷未做行级鉴权，上线前按需加固）；
  5. 另需办理「小程序主体备案」（与域名 ICP 是两件事）；众筹类目建议用**企业主体**小程序，个人主体可能过不了审核。

## 待办（已知 TODO）

- **微信支付未接入**：`payment-operations.create_order` 当前返回「微信支付尚未接入」，仅 `demo_donate`（演示捐款）可用。接入需申请微信支付商户号、实现统一下单（`/api/payments/orders`）、异步回调验签（`/api/payments/wechat/callback` 已留入口）。
- **行级权限**：生产环境建议对 `/api/db` 与各资源接口做更细的鉴权（当前依赖前端传入 openid，仅做创建者校验）。
- **配置文件密钥**：`application.yml` 中的微信 Secret 建议上线前改用环境变量/配置中心；`application-prod.yml` 已支持 `WECHAT_SECRET` 环境变量覆盖明文，数据库账号同理支持 `DB_*` 变量。
