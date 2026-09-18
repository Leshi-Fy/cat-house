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

> ✅ **2026-09-16 补上了缺失文件**：`cat-house/supabase/functions/api/index.ts` 现已由 `supabase/memfire/index.js`（Node 版）移植而来，
> 是整个架构里**唯一缺的关键文件**——前端 `utils/supabase.js` 所有请求（登录/库/上传）都打到它（`/functions/v1/api`）。
> 不要混用 `memfire/index.js`（那是 MemFire 云函数格式，不是 Supabase Edge Function）。

### 方式 A（推荐，免 CLI）：Studio 粘贴部署
1. 浏览器开 `http://192.168.1.50:8000`（Supabase Studio）→ **Edge Functions → Create a new function** → Name 填 `api`。
2. 把 `cat-house/supabase/functions/api/index.ts` **整段**粘贴覆盖默认模板 → **Deploy function**。
3. 进入函数 → **Secrets / Environment variables**，设置 4 个变量：
   - `SB_URL=http://kong:8000`（函数跑在 NAS 内网，连 Kong 用服务名；填 `http://192.168.1.50:8000` 也行）
   - `SB_SERVICE_ROLE_KEY=<你的 service_role key，来自 nas-supabase/.env>`
   - `WECHAT_APPID=wx9c42b2dc8d0f83eb`
   - `WECHAT_SECRET=<你的小程序 AppSecret，mp.weixin.qq.com → 开发设置>`
4. 找到 **Verify JWT** 开关并**关闭**（让前端匿名即可调用；函数内部用 service_role 干活）。
5. 改完 Secrets 再点一次 **Deploy**，让函数重新加载环境变量。

### 方式 B（CLI 容器）：`supabase functions deploy api`
```bash
docker run --rm \
  -e SUPABASE_URL=http://host.docker.internal:8000 \
  -e SUPABASE_SERVICE_ROLE_KEY=<你的SERVICE_ROLE_KEY> \
  -v $PWD/supabase/functions:/functions \
  supabase/cli functions deploy api --no-verify-jwt
# 设 Secrets（函数内网地址）
docker run --rm \
  -e SUPABASE_URL=http://host.docker.internal:8000 \
  -e SUPABASE_SERVICE_ROLE_KEY=<你的SERVICE_ROLE_KEY> \
  supabase/cli secrets set \
    SB_URL=http://kong:8000 \
    SB_SERVICE_ROLE_KEY=<你的SERVICE_ROLE_KEY> \
    WECHAT_APPID=wx9c42b2dc8d0f83eb \
    WECHAT_SECRET=<你的微信AppSecret>
```
> CLI 部署需要项目里有 `supabase/config.toml`（自托管可放一个最小版：`[api] enabled = true`）。若没有，优先用方式 A。

### 快速联调兜底（自托管 Edge Function 部署卡住时用）
若 NAS 的 Edge Function 部署走不通，可临时把 Node 版 `supabase/memfire/index.js` 起成一个小 HTTP 服务（加 ~20 行 http server 包装），
监听某端口，再把 `utils/supabase.js` 顶部的 `SUPABASE_URL` 改指向该服务（函数内仍连 NAS Supabase 的 service_role）。
这样**不动前端架构**就能先在局域网联调通，正式上线再换回 Edge Function。需要我直接写这个 Node 服务版就说一声。

### 2. 部署（用 supabase cli，容器方式避免 NAS 装二进制）
```bash
docker run --rm \
  -e SUPABASE_URL=http://host.docker.internal:8000 \
  -e SUPABASE_SERVICE_ROLE_KEY=<你的SERVICE_ROLE_KEY> \
  -v $PWD/functions:/functions \
  supabase/cli functions deploy api
```
> `host.docker.internal` 在绿联 Docker 通常可用（连 NAS 宿主网络的 Kong:8000）。
> 若不行，改成 NAS 内网 IP：`http://<NAS_IP>:8000`。

### 3. 设置函数 Secrets（内网地址，不是 Tunnel 域名）
函数里读的 `SB_URL` 必须是**内网 Kong 地址**（函数跑在 NAS 内网，连 Kong 用内网）：
```bash
docker run --rm \
  -e SUPABASE_URL=http://host.docker.internal:8000 \
  -e SUPABASE_SERVICE_ROLE_KEY=<你的SERVICE_ROLE_KEY> \
  supabase/cli secrets set \
    SB_URL=http://kong:8000 \
    SB_SERVICE_ROLE_KEY=<你的SERVICE_ROLE_KEY> \
    WECHAT_APPID=wx9c42b2dc8d0f83eb \
    WECHAT_SECRET=<你的微信AppSecret>
```
> 注：`SB_URL` 用 `http://kong:8000`（Compose 网络内 Kong 服务名）。如果上面 deploy 时连不上，改 `http://host.docker.internal:8000` 或 `http://<NAS_IP>:8000`。

### 4. 验证函数
```bash
curl -X POST http://<NAS_IP>:8000/functions/v1/api \
  -H "Authorization: Bearer <ANON_KEY>" \
  -H "Content-Type: application/json" \
  -d '{"name":"login","code":"dummy"}'
```
返回 `{"result":{"error":"invalid code"}}` 即函数活了。

---

## 四、公网 HTTPS（Cloudflare Tunnel）

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
