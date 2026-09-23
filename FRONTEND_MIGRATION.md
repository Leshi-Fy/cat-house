# 前端迁移说明：Supabase/Deno → Java Spring Boot REST

> 本文件记录「猫屋」小程序前端从 Supabase（Deno Edge Function）后端迁移到 **Java Spring Boot + MySQL** 标准 REST 后端的适配细节。
> 架构决策见 `2026-09 工作记忆`：用户已决定不使用 Supabase，采用「小程序前端 + Java 后端」常规架构。

## 一、迁移策略（零页面改动）

前端页面（pages/*）**一行未改**。关键的适配点是 `app.js` 的 `wx.cloud.*` 猴子补丁：

| 原调用 | 旧目标 | 新目标 |
| --- | --- | --- |
| `wx.cloud.callFunction({name, data})` | `utils/supabase.js` → Deno Edge Function | `utils/api.js` → Java REST |
| `wx.cloud.database()` | `utils/supabase.js` 数据库代理 | `utils/api.js` 数据库代理 → `POST /api/db` |
| `wx.cloud.uploadFile(...)` | `utils/supabase.js` → Storage 上传 | `utils/api.js` → `POST /api/upload` |

`utils/api.js` 对外接口与 `utils/supabase.js` **完全一致**，因此只需把 `app.js` 的 `require('./utils/supabase.js')` 改为 `require('./utils/api.js')` 即可。

> `utils/supabase.js` 已不再被引用，保留仅作迁移参考；`utils/database.js`（云开发数据库封装）仍被 11 个页面使用，但通过上面的猴子补丁已自动走 Java 后端，无需改动。

## 二、信封归一化（api.js 内部）

Java 统一返回 `{ code, message, data }`（code=0 成功）。`api.js` 在其内部把 `data` 归一化成 Deno 的 `result` 信封，保证页面拿到的结构与旧后端一致：

- 成功且 `data` 为对象 → 补 `success: true`（与 Deno 的 `success:true` 一致，页面 `if(result.success)` 正常生效）
- 成功且 `data` 为数组 → 原样返回（`merge-operations.list` 在 Deno 中即裸数组）
- 成功且 `data` 为 null → `{ success: true }`（写操作成功）
- 业务错误（code≠0）→ 解析为 `{ result: { error: message } }`（与 Deno「HTTP 200 + {result:{error}}」行为一致）
- 网络/传输失败 → reject（与 supabase.js 一致）

## 三、操作 → REST 映射表（callFunction 路由）

`api.js` 根据 `name + data.action` 路由到对应 REST 端点，并自动注入 `openid`（来自 Storage）。

| name | action | 方法 | 路径 | 说明 |
| --- | --- | --- | --- | --- |
| `login` | — | POST | `/api/auth/login` | body: `{code}` |
| `cat-operations` | `create` | POST | `/api/cats` | body: `{catData}` |
| | `nearby` | GET | `/api/cats/nearby` | query: `latitude,longitude,page,pageSize` |
| | `detail` | GET | `/api/cats/{catId}` | |
| | `update` | PUT | `/api/cats/{catId}` | body: `{updateData}` |
| | `myCats` | GET | `/api/cats/my` | |
| `feed-operations` | `create` | POST | `/api/feeds` | body: `{content,photos,catId}` |
| | `list` | GET | `/api/feeds` | query: `page,pageSize` |
| | `myFeeds` | GET | `/api/feeds/my` | query: `page,pageSize` |
| | `update` | PUT | `/api/feeds/{feedId}` | body: `{content,photos,catId}` |
| | `like` | POST | `/api/feeds/{feedId}/like` | |
| | `unlike` | DELETE | `/api/feeds/{feedId}/like` | |
| | `delete` | DELETE | `/api/feeds/{feedId}` | |
| | `getDetail` | GET | `/api/feeds/{feedId}` | |
| | `addComment` | POST | `/api/feeds/{feedId}/comments` | body: `{content,parentId}` |
| | `listComments` | GET | `/api/feeds/{feedId}/comments` | query: `page,pageSize` |
| | `listReplies` | GET | `/api/feeds/comments/{commentId}/replies` | **新增**：Deno 未实现，原来走降级；现直接支持 |
| | `deleteComment` | DELETE | `/api/feeds/comments/{commentId}` | |
| `crowd-operations` | `create` | POST | `/api/crowdfundings` | body: `{crowdData}` |
| | `list` | GET | `/api/crowdfundings` | query: `status,page,pageSize` |
| | `apply_receipt` | POST | `/api/crowdfundings/{crowdId}/receipts` | body: `{amount,remark,receipts}` |
| | `approve_receipt` | POST | `/api/crowdfundings/{crowdId}/receipts/approve` | body: `{approved}` |
| | `complete_crowd` | POST | `/api/crowdfundings/{crowdId}/complete` | body: `{}` |
| `payment-operations` | `demo_donate` | POST | `/api/payments/donate` | body: `{crowdId,amount,donorName}` |
| | `create_order` | POST | `/api/payments/orders` | 后端返回「微信支付尚未接入」错误 |
| `notify-operations` | `list` | GET | `/api/notifications` | query: `type,page,pageSize` |
| | `unreadCount` | GET | `/api/notifications/unread-count` | |
| | `markRead` | POST | `/api/notifications/read` | body: `{ids}` |
| | `markAllRead` | POST | `/api/notifications/read-all` | body: `{type}` |
| `merge-operations` | `create` | POST | `/api/merge-requests` | body: `{fromCatId,toCatId,note}` |
| | `approve` | POST | `/api/merge-requests/{requestId}/approve` | body: `{}` |
| | `reject` | POST | `/api/merge-requests/{requestId}/reject` | body: `{reason}` |
| | `list` | GET | `/api/merge-requests` | query: `status,userId` |
| `db` | `get/list/count/add/update/remove` | POST | `/api/db` | 通用代理，见第四节 |

## 四、通用数据库代理 `/api/db`

`utils/database.js` 通过 `wx.cloud.database()` 适配器，把云开发链式调用转发到 `POST /api/db`，协议与 Deno `dbProxy` 一致：

请求体：`{ op, collection, id, where, orderBy, skip, limit, data }`
返回：`get/list → { data }`，`count → { total }`，`add → { _id }`，`update/remove → { success:true }`

`collection` 白名单：`users / stray_cats / home_cats / crowdfundings / donations / merge_requests / feeds / feed_comments / feed_likes / notifications`
约束：camelCase↔snake_case 自动转换；JSON 列（`photos`/`merge_chain`/`aliases`/`receipt_records`/`cat_info`）读写自动序列化/反序列化；`create_time`/`update_time` 由服务端生成；列名仅允许 `[a-z0-9_]` 防注入。

## 五、文件清单（本次迁移新增/改动）

- 新增 `miniprogram/utils/api.js` —— REST 适配器（替代 supabase.js）
- 改动 `miniprogram/app.js` —— require 切换到 api.js
- 新增 `server/src/main/java/com/cathouse/service/DbService.java` —— 通用数据库代理
- 新增 `server/src/main/java/com/cathouse/controller/DbController.java` —— `/api/db` 端点
- 改动 `server/.../controller/FeedController.java` —— 新增 `listReplies`
- 改动 `server/.../service/FeedService.java` —— 新增 `listReplies`
- 改动 `server/.../service/NotifyService.java` —— `list` 改为返回客户端映射（修复 bug）
- 改动 `server/.../controller/CatController.java` / `HomeCatController.java` —— `my` 返回 `{success,data}`
- 改动 `server/pom.xml` —— 新增 `spring-boot-starter-jdbc`

> 后端完整骨架（实体/Mapper/Service/Controller/配置）参见 `server/` 目录与 `server/README.md`。

## 六、环境配置（前端，新增）

前端环境配置集中在 `miniprogram/utils/env.js`，与后端 `application-{dev,prod}.yml` 的 profile 对齐：

| ENV | 含义 | apiBaseUrl | 对应后端 |
| --- | --- | --- | --- |
| `dev` | 本地开发 / 开发者工具模拟器（后端同机） | `http://127.0.0.1:8787` | `application-dev.yml` |
| `test` | NAS 局域网联调（手机真机调试） | `http://192.168.1.50:8787` | `application-dev.yml`（NAS 上跑同一份 dev） |
| `prod` | 线上云服务器（已备案域名 + HTTPS） | `https://your-domain.com` | `application-prod.yml` |

切换方式：修改 `env.js` 顶部的 `ENV` 常量（`'dev' | 'test' | 'prod'`），开发者工具「编译」即生效。

优先级：`api.js` 的 `getBaseUrl()` 先读 Storage 临时键 `cathouse_api_base`（便于临时换 IP/端口联调），再回退到 `env.js` 的 `apiBaseUrl`。

> `fileBaseUrl` 仅作与后端 `file.base-url` 对齐的参考；上传后小程序拿到的可访问 URL 由后端 `UploadService` 按自身配置拼出并直接返回，前端无需自行拼地址。
>
> 微信正式发布禁止纯 IP / HTTP，故 `prod` 必须是已备案域名 + 受信任 HTTPS；开发/联调阶段在开发者工具勾选「不校验合法域名」即可用 IP + HTTP。
