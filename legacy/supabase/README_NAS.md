# 猫屋小程序 · NAS 自托管 Supabase 部署指南

> 适用：绿联 NAS（8GB 内存，已装 Docker / Docker Compose，能跑 Frigate 同款 Compose）
> 目标：在 NAS 上跑一套完整 Supabase（Postgres + Auth + Storage + Edge Functions），
>       通过 Cloudflare Tunnel 暴露公网 HTTPS，让微信小程序直连，零费用、数据全在家。

---

## 整体架构

```
微信小程序
   │  HTTPS 请求 /functions/v1/api
   ▼
Cloudflare Tunnel（公网 HTTPS，免费，不用备案）
   │  http://localhost:8000（Kong API 网关）
   ▼
NAS Docker 网络
   ├─ Kong (8000)  ← Edge Functions 路由 /functions/v1/*
   ├─ Postgres (5432)  ← 10 张表（schema.sql）
   ├─ Storage  ← cat-images 桶（图片）
   └─ Deno Edge Runtime  ← api 函数（supabase/functions/api/index.ts）
```

---

## 一、部署 Supabase 全套

### 1. SSH 进 NAS
绿联 NAS 后台开启 SSH，用终端连：
```bash
ssh root@<你的NAS_IP>     # 密码在绿联后台"终端"页查看
```

### 2. 拉取官方 Compose
```bash
cd /volume1/docker        # 绿联 Docker 目录，按实际调整
git clone --depth 1 https://github.com/supabase/supabase
cd supabase/docker
```

### 3. 生成并修改 .env
```bash
cp .env.example .env
# 用 openssl 生成 JWT 密钥，填进 JWT_SECRET
openssl rand -base64 32
```
至少要改 `.env` 里的：
- `JWT_SECRET=` 上面生成的随机串
- `ANON_KEY=` / `SERVICE_ROLE_KEY=` 用官方脚本生成（见 supabase/docker 里的 `gen_keys` 说明，或搜 "supabase generate keys"）
- `SITE_URL=` `http://localhost:8000`
- `SUPABASE_PUBLIC_URL=` `http://localhost:8000`（内网先用，Tunnel 之后外网走 Tunnel 域名）

> 生成的 `ANON_KEY` / `SERVICE_ROLE_KEY` 后面前端和函数都要用，先存好。

### 4. 启动
```bash
docker compose -f docker-compose.yml up -d
```
等 1~2 分钟，浏览器开 `http://<NAS_IP>:8000` 应能看到 Supabase Studio（如果 NAS 端口映射了 8000）。
如不想对局域网开 8000，可只在 NAS 内网用，外网走 Tunnel。

---

## 二、建数据库 + 存储桶

### 1. 执行 schema.sql
- 方式 A：Studio → SQL Editor 粘贴 `cat-house/supabase/schema.sql` 整段执行
- 方式 B：NAS 上 `docker exec -i <postgres容器> psql -U postgres -d postgres < schema.sql`

### 2. 建 cat-images 桶
Studio → Storage → New bucket → 名称 `cat-images` → 勾 **Public**。
并执行公开读 policy（SQL Editor）：
```sql
create policy "public read cat-images"
on storage.objects for select
using ( bucket_id = 'cat-images' );
```

---

## 三、部署 Edge Function（api）

> ⚠️ **自托管的部署机制和云上完全不同**：没有 Studio「Create a function」，也没有 `supabase functions deploy`。
> 别去 Studio 找那个入口（自托管没有这个能力），按下面做。

### 1. 机制：放文件 + 重启

函数容器把宿主 `volumes/functions/` 挂到容器内 `/home/deno/functions`，
容器里的 `main/index.ts` 按 **URL 第一段** 动态找目录（**无白名单、无注册表**）：

```ts
const service_name = path_parts[1]                            // /api  ->  "api"
const servicePath = `/home/deno/functions/${service_name}`    // -> /home/deno/functions/api
```

所以只要 `volumes/functions/api/index.ts` 存在，`POST /functions/v1/api` 就能命中。

**部署 = 两步**：

1. 把 `api/index.ts` 放到 NAS 的 `volumes/functions/api/`
   （**本套件 `nas-supabase/volumes/functions/api/index.ts` 已经放好了**，直接用）
2. 重启容器：`docker restart supabase-edge-functions`

### 2. 环境变量：已在 compose 里，不用在面板上设

`compose.ugos.yaml` 的 `functions` 服务里已经写好（含 `VERIFY_JWT: "false"`）：

| 变量 | 值 | 作用 |
|---|---|---|
| `SB_URL` | `http://api-gw:8000` | 函数在 Docker 内网访问 PostgREST / Storage |
| `SB_PUBLIC_URL` | `http://192.168.1.50:8000` | **拼图片公开 URL**（必须是客户端可达的地址） |
| `SB_SERVICE_ROLE_KEY` | service_role 密钥 | 绕过 RLS 读写库与桶 |
| `WECHAT_APPID` / `WECHAT_SECRET` | 小程序凭据 | `code2session` 换 openid |
| `VERIFY_JWT` | `false` | 关闭入站 JWT 校验（联调期） |

> ⚠️ **`SB_PUBLIC_URL` 就是"图片能不能显示"的开关**。它若填成内网服务名（如 `http://api-gw:8000`），
> 上传接口返回的图片 URL 小程序解析不了，图全裂。**换成 Tunnel 域名后必须同步改它并重启 functions。**

### 3. 验证函数活着

在能访问 NAS 的机器上执行：

```bash
curl -X POST http://192.168.1.50:8000/functions/v1/api \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"login","code":"dummy"}'
```

| 返回 | 含义 |
|---|---|
| `{"result":{"error":...}}`（如 code 无效） | ✅ **函数活着**，路由通了 |
| 404 / `missing function name` | 目录没放对 → 检查 NAS 上 `volumes/functions/api/index.ts` 是否存在 |
| 500 | 函数内部报错 → `docker logs supabase-edge-functions --tail 50` |

### 4. ⚠️ 以套件版函数为准（仓库版曾是回归版）

函数代码存在**两份副本**：套件 `nas-supabase/volumes/functions/api/index.ts` 与项目仓库 `supabase/functions/api/index.ts`。
仓库那份曾出现回归（已修正为与套件版一致，md5 相同）：

- 用了 `import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'`
  → 冷启动要连 deno.land，NAS 外网受限时可能直接失败。套件版用**原生 `Deno.serve`**，无外网依赖。
- 用 `supabase.storage.getPublicUrl()` 拼图片地址
  → 拿到的是内网 `http://api-gw:8000/...`，**小程序永远打不开图**。
  套件版用 `SB_PUBLIC_URL` 拼公开地址，并带 `normalizeSupabaseUrl()` 防 PGRST125。

**改函数时：先改套件版，再 `cp` 到仓库版，最后 `md5sum` 比对确认两份一致。**

---

## 四、公网 HTTPS（Cloudflare Tunnel）

> 📌 本节的 `cloudflared --url` 是**临时快速隧道**（域名每次重启都变，仅供临时验证）。
> 要固定域名 / 小程序正式发布，走套件内 `域名绑定-Cloudflare-Tunnel.md`（含备案前置条件与三条上线路线）。

小程序 request 域名必须 HTTPS 且不能填 IP。家庭 NAS 没有公网域名，用 **Cloudflare Tunnel**（免费、不用公网 IP、不用备案）。

### 1. NAS 上跑 cloudflared（Docker 方式）
```bash
docker run -d --name cloudflared --restart always \
  cloudflare/cloudflared:latest \
  tunnel --url http://host.docker.internal:8000
```
启动后日志里会出现一个 `https://xxxx.trycloudflare.com` 临时域名（每次重启会变）。
想要固定域名：去 Cloudflare 后台建 Tunnel，拿到 `cloudflared tunnel run --token <token>` 的启动命令（稳定不丢）。

> 记下你的 Tunnel 域名，下面前端要用。

### 2. 确认外网可访问
浏览器开 `https://你的tunnel域名/functions/v1/api`（应返回 JSON 错误，说明通了）。

---

## 五、前端改动（miniprogram/utils/supabase.js）

只改顶部两个常量：

```js
// 改成你的 Cloudflare Tunnel 公网域名（不要带 /functions/v1）
const SUPABASE_URL = 'https://你的tunnel域名';
// 改成 NAS Supabase 的 anon key（.env 里的 ANON_KEY）
const ANON_KEY = '<你的ANON_KEY>';
```

`FUNCTION_URL` 自动拼成 `https://你的tunnel域名/functions/v1/api`，不用动。

---

## 六、微信公众平台加合法域名

mp.weixin.qq.com → 开发管理 → 开发设置 → 服务器域名，把 Tunnel 域名加到三处：
- request 合法域名：`https://你的tunnel域名`
- uploadFile 合法域名：`https://你的tunnel域名`
- downloadFile 合法域名：`https://你的tunnel域名`

---

## 七、验证上线

1. 微信开发者工具导入 `cat-house`，编译
2. 三个 Tab 走一遍：首页划卡 / 社区 / 我的 → 登录
3. 新建一只猫 → 上传头像 → 回首页自动刷新
4. 控制台无 `ERR_CONNECTION_TIMED_OUT` 即成功

---

## 常见问题

| 现象 | 原因 | 解决 |
|---|---|---|
| 函数 401 | Verify JWT 开着 | 自托管默认不校验，若报错检查 Kong 配置 |
| 上传 400 | Storage 桶没 Public / 没 policy | 确认 cat-images 勾 Public + 执行公开读 policy |
| 图片加载慢 | Tunnel 带宽有限 | 家庭宽带上行通常 20-50Mbps，够小图；大图走压缩（已做） |
| Tunnel 域名变 | 用了临时隧道 | 去 Cloudflare 建固定 Tunnel（token 启动） |
| NAS 重启后服务没起 | 容器没设 restart | Compose 已 `restart: unless-stopped`；cloudflared 加 `--restart always` |
