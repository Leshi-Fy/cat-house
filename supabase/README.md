# 猫屋小程序 · Supabase 后端部署指南

> 本指南用于把猫屋原本跑在微信云开发上的后端（8 个云函数 + 10 张集合），迁移到官方 Supabase（supabase.com）。前端通过 `miniprogram/utils/supabase.js` 垫片层保持**业务页面零改动**。

---

## 一、准备 4 个 key（你来做）

1. 打开 [supabase.com](https://supabase.com) → 注册/登录 → **New Project**。
2. 等部署完成后，进入 **Project Settings → API**，拿到：
   - **Project URL** —— 形如 `https://xxxx.supabase.co`
   - **anon public key** —— 公开的，前端用
   - **service_role key** —— 私密！只在 Edge Function 服务端用，绝不下发前端
3. 在微信公众平台（mp.weixin.qq.com）拿到 AppID `wx9c42b2dc8d0f83eb` 对应的 **AppSecret**（Edge Function 里做 jscode2session 用）。

---

## 二、建数据库（你来做）

在 Supabase 控制台 **SQL Editor** → New Query，把 `supabase/schema.sql` **整段粘贴**执行，会创建 10 张表及索引：

```
users / stray_cats / home_cats / crowdfundings / donations
merge_requests / feeds / feed_likes / feed_comments / notifications
```

> 列名 snake_case，后端返回时自动转 camelCase（含 `_id`）；定位用 `latitude`/`longitude`，距离在 Edge 端 haversine 算，不依赖 postgis。
> RLS 默认关闭，鉴权由 Edge Function 应用层完成（与原云开发信任 openid 的模型一致）。

---

## 三、建 Storage 桶（你来做）

1. 控制台 **Storage** → New bucket，名称 `cat-images`。
2. 勾选 **Public bucket（公开桶）**，这样上传后返回的是可直接 `<image src>` 的公开 URL。
3. 允许图片 MIME 类型（png/jpg/jpeg/gif/webp）。

> 图片上传流程：前端用 `wx.uploadFile` 把文件发到 Edge Function，Edge Function 用 service_role key 写入 Storage。因此 Storage 的 RLS policy 不是必须的（service role 绕过 RLS），但保留 anon insert policy 也不会影响。

---

## 四、部署 Edge Function（两种方式二选一）

### 方式 A：Supabase CLI（推荐，可复现）

```bash
# 1. 安装 CLI（已装可跳过）
npm install -g supabase

# 2. 登录
supabase login

# 3. 关联项目（xxxx 是你项目 URL 里的 ref）
supabase link --project-ref xxxx

# 4. 设置 4 个环境变量（Secrets）
# 注意：SB_URL 只需根域名 https://xxxx.supabase.co，不要带 /rest/v1/ 后缀
supabase secrets set \
  SB_URL=https://xxxx.supabase.co \
  SB_SERVICE_ROLE_KEY=<service_role key> \
  WECHAT_APPID=wx9c42b2dc8d0f83eb \
  WECHAT_SECRET=<微信 AppSecret>

# 5. 部署函数（--no-verify-jwt 必须带，函数才能被前端匿名调用）
supabase functions deploy api --no-verify-jwt
```

### 方式 B：Supabase 控制台粘贴（纯浏览器，不用装 CLI）

1. 控制台 → **Edge Functions** → **Create a new function** → Name 填 `api`。
2. 把 `supabase/functions/api/index.ts` **整段**粘贴覆盖默认模板 → **Deploy function**。
3. 进入函数 → **Secrets / Environment variables**，设置 4 个变量（同上）。
   - `SB_URL` 只需填 `https://xxxx.supabase.co`，**不要带 `/rest/v1/` 后缀**；填错会导致图片上传报 `PGRST125 Invalid path specified in request URL`。
4. 找到 **Verify JWT** 开关并**关闭**（Public）。
5. 改完 Secrets 建议再点一次 **Deploy**，让函数重新加载环境变量。

---

## 五、验证函数是否存活

### Windows PowerShell（推荐）

```powershell
Invoke-RestMethod -Uri "https://xxxx.supabase.co/functions/v1/api" -Method POST -Headers @{"Authorization"="Bearer <anon_key>"; "Content-Type"="application/json"} -Body '{"name":"login","code":"dummy"}'
```

### Bash / macOS / Linux

```bash
curl -X POST "https://xxxx.supabase.co/functions/v1/api" -H "Authorization: Bearer <anon_key>" -H "Content-Type: application/json" -d "{\"name\":\"login\",\"code\":\"dummy\"}"
```

返回 `{"result":{"error":"invalid code"}}` 或类似即函数已跑起来（`code` 是假的，所以微信那边报错，正常）。

---

## 六、小程序侧配置（改 2 处 + 加域名）

### 1. 改 `miniprogram/utils/supabase.js`

打开文件，把顶部两个常量填成你的真实值：

```js
const SUPABASE_URL = 'https://xxxx.supabase.co';          // 你的 Project URL
const ANON_KEY = 'eyJ...';                                // 你的 anon public key
```

### 2. 微信后台加合法域名

登录 [mp.weixin.qq.com](https://mp.weixin.qq.com) → 你的小程序 → **开发管理 → 开发设置 → 服务器域名**，把 `https://xxxx.supabase.co` 加到：

- **request 合法域名**
- **uploadFile 合法域名**
- **downloadFile 合法域名**

> 加完后微信需要几分钟同步。如果 `supabase.co` 在微信后台无法保存/校验，换成 MemFire Cloud（国内备案域名）即可，前端只改 `SUPABASE_URL`。

### 3. 微信开发者工具导入项目

- 目录：`C:\Users\leshi\WorkBuddy\20260415135626\cat-house`
- 确认项目设置里 **不校验合法域名** 是关闭状态
- 点编译，三个 Tab 走一遍：首页划卡、社区、我的

---

## 七、常见问题

### 1. 图片上传报 `PGRST125 Invalid path specified in request URL`

**原因**：`SB_URL` 环境变量填成了 `https://xxxx.supabase.co/rest/v1`，导致 Storage client 的 URL 被 PostgREST 拦截。

**解决**：把 `SB_URL` 改成根域名 `https://xxxx.supabase.co`，然后重新 Deploy 函数。代码里已加 `normalizeSupabaseUrl()` 做兼容，但最好从源头填对。

### 2. 图片上传报 400 / 403

1. 确认 `cat-images` 桶已创建且为 Public。
2. 在 SQL Editor 执行：
   ```sql
   create policy "anon upload to cat-images"
   on storage.objects for insert to anon
   with check (bucket_id = 'cat-images');
   ```
3. 确认微信后台 **uploadFile 合法域名** 已加。

### 3. 登录报 `invalid code` / openid 获取失败

1. 检查 Edge Function Secrets 里的 `WECHAT_APPID` 和 `WECHAT_SECRET` 是否填对。
2. 小程序的 AppID 必须与 `WECHAT_APPID` 一致（`wx9c42b2dc8d0f83eb`）。

### 4. 请求超时 / 国内访问慢

- 官方 `supabase.co` 在国内部分地区不稳，建议切到 MemFire Cloud（`https://xxxx.api.memfiredb.com`），前端只改 `SUPABASE_URL`。

---

## 八、已交付文件

| 文件 | 作用 |
|---|---|
| `supabase/schema.sql` | 10 张 Postgres 表 |
| `supabase/functions/api/index.ts` | Edge Function 主程序，路由 8 个云函数 + db 代理 + 文件上传代理 |
| `miniprogram/utils/supabase.js` | 前端垫片：`wx.cloud.callFunction` / `wx.cloud.database()` / `wx.cloud.uploadFile` |
| `miniprogram/app.js` | 挂垫片、改登录入口 |

完成以上步骤即可把猫屋跑在 Supabase 上。卡住随时截图发我。
