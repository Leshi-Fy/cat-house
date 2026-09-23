# 归档文件说明（legacy/）

## 背景

猫屋小程序已完成后端架构迁移：从原来的「**微信云函数 + Supabase（Deno Edge Function）**」改为「**Java Spring Boot + MySQL**」后端。

本目录集中存放迁移后**不再被小程序运行**的旧代码，仅作参考与回滚留存，已从主代码树移除。

## 当前活跃的代码（对照）

| 用途 | 位置 |
| --- | --- |
| 后端服务 | `server/`（Spring Boot + MyBatis-Plus + MySQL） |
| 前端数据适配层 | `miniprogram/utils/api.js`（REST 适配器，取代原 `supabase.js`） |
| 数据库建表 | `server/sql/schema_mysql.sql` |
| 迁移说明 | `FRONTEND_MIGRATION.md`（根目录） |

---

## 本目录文件清单与作用

### 1. `supabase.js`（原 `miniprogram/utils/supabase.js`）
- **作用**：旧的前端 Supabase 适配器，封装对 Deno Edge Function 的调用，曾是前端数据层的入口。
- **现状**：已被 `miniprogram/utils/api.js` 完全取代；`app.js` 的 `require` 已切到 `api.js`，全项目无任何页面再引用它（仅 `api.js` 注释中提及）。

### 2. `db-init.js`（原 `miniprogram/utils/db-init.js`）
- **作用**：微信云开发数据库初始化脚本，用于在云开发控制台手动创建 6 个集合（`users` / `stray_cats` / `home_cats` / `crowdfundings` / `donations` / `merge_requests`）及其索引。
- **现状**：云开发已弃用，建表改由 `server/sql/schema_mysql.sql` 在 MySQL 中执行。

### 3. `supabase/`（原项目根 `supabase/`）
- **作用**：旧的后端实现，基于 Supabase 的 Deno Edge Function。包含：
  - `functions/api/index.ts`：核心 API 实现（35 个业务操作的 Deno 参考实现，是 Java 后端复刻的契约来源）
  - `schema.sql`：PostgreSQL 建表脚本（MySQL 版见 `server/sql/schema_mysql.sql`）
  - `memfire/index.js`：MemFireDB 适配变体
  - `README.md` / `README_NAS.md`：Supabase / NAS 自托管部署说明
- **现状**：整个目录已被 `server/`（Java）取代。`index.ts` 仅保留作为 Java 实现的参考。

### 4. `cloudfunctions/`（原项目根 `cloudfunctions/`）
- **作用**：最早的微信云函数后端（在 Supabase 之前），按业务拆分的云函数：
  - `login`、`cat-operations`、`crowd-operations`、`feed-operations`、`merge-operations`、`notify-operations`、`payment-operations`、`db-init`
  - 每个含 `package.json` / `index.js`，依赖 `@cloudbase` 等（含 `node_modules`）
- **现状**：小程序已不再调用任何云函数——`wx.cloud.callFunction` 在 `app.js` 中被猴子补丁重定向到 `api.js`，整目录废弃。

---

## 故意保留、未归档的文件

- `miniprogram/utils/database.js`：仍被 11 个页面 `require`，但其中的 `wx.cloud.database()` 已被 `app.js` 猴子补丁接管，实际走 Java 的 `/api/db` 代理。**删除会导致这些页面 `require` 失败，故必须保留。**
- `miniprogram/utils/config.js`、`util.js`：前端通用工具，仍在使用。

---

## 如何恢复 / 回滚

这些文件只是被**移动**，并未删除。如需回退到旧架构：

1. git 中它们会显示为「原路径删除 + 本目录新增」，可用 `git checkout <commit> -- <原路径>` 还原；
2. 或直接把本目录内文件移回原路径（`miniprogram/utils/`、`supabase/`、`cloudfunctions/`），并把 `app.js` 的 `require` 切回 `supabase.js`。

确认新 Java 架构稳定后，可整体删除本 `legacy/` 目录。
