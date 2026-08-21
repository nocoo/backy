<p align="center">
  <img src="logo.png" alt="Backy Logo" width="80" height="80">
</p>

<h1 align="center">Backy</h1>

<p align="center">
  <strong>AI 备份管理服务</strong><br>
  接收 · 存储 · 预览 · 恢复
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Vite-7-purple" alt="Vite">
  <img src="https://img.shields.io/badge/Cloudflare%20Workers-orange" alt="Cloudflare Workers">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/D1%20%2B%20R2-orange" alt="Cloudflare">
  <img src="https://img.shields.io/badge/License-MIT-yellow" alt="License">
</p>

---

## ✨ 功能特点

- 📦 **Webhook 接收** — AI Agent 通过 webhook 发送备份文件（ZIP / JSON）
- 🔑 **API Key 验证** — HEAD 请求轻量验证 API key 正确性
- 📊 **备份状态查询** — GET 请求查询备份总数和最近记录
- 🗂️ **项目管理** — 按项目组织备份，独立 webhook token
- 🔍 **JSON 预览** — 在线树形查看 JSON 备份内容
- 📥 **一键恢复** — 生成临时签名 URL 供 Agent 下载（Bearer token 或 query param）
- 🏷️ **标签 & 环境** — 按 dev/prod/staging/test 环境和标签分类
- 🛡️ **IP 白名单** — 可选的 CIDR 范围限制
- 🤖 **Prompt 生成** — 一键生成 AI Agent 集成提示词（含真实凭据）
- 📈 **仪表盘图表** — 按项目统计备份数量/存储用量 + 每日活动趋势
- 🔔 **Toast 通知** — 操作反馈通过 sonner toast 展示

## 🚀 快速开始

### 1️⃣ 安装依赖

```bash
# 需要先安装 Bun: https://bun.sh
bun install
```

### 2️⃣ 配置环境

`apps/worker` 通过 wrangler 读取 secrets/vars；本地开发可在 `apps/worker/.dev.vars` 写：

```bash
# Cloudflare D1 (元数据数据库) — 通过 wrangler D1 binding 注入
# Cloudflare R2 (文件存储)     — 通过 wrangler R2 binding 注入
# Cloudflare Access (身份)     — 由 CF Access JWT 注入 cf-access-jwt-assertion header
```

详见 `apps/worker/wrangler.toml` 的 `[d1_databases]` / `[[r2_buckets]]` 段。

### 3️⃣ 启动开发服务器

```bash
bun dev   # 同时拉起 wrangler dev (7018) + vite (7019)
```

打开浏览器访问 👉 [http://localhost:7019](http://localhost:7019)（vite 代理 `/api/*` → 7018 worker）

## 📁 项目结构

Backy 采用 **Bun monorepo** 结构（`workspaces: ["apps/*", "packages/*"]`）：

```
backy/
├── 📂 apps/
│   ├── 📂 web/                    # @backy/web — Vite + React SPA (生产前端)
│   │   ├── 📂 src/                # 路由、组件、库、单元测试
│   │   └── package.json
│   ├── 📂 worker/                 # @backy/worker — Hono on Cloudflare Workers (API + cron + assets)
│   │   ├── 📂 src/                # routes、middleware、lib
│   │   ├── 📂 static/             # vite 构建产物落盘点 (gitignored)
│   │   ├── wrangler.toml
│   │   └── package.json
│   └── 📂 cli/                    # @backy/cli — 占位包，下一波将实现 AI-facing CLI
├── 📂 packages/
│   └── 📂 api/                    # @backy/api — 共享业务逻辑 (handlers/lib)
├── 📂 scripts/                    # 仓库级运行器 (gate-security.ts, release.ts)
├── 📂 docs/                       # 项目文档 (07-vite-web-migration-plan.md 跟踪迁移)
├── 📂 .husky/                     # Git hooks (pre-commit, pre-push)
├── osv-scanner.toml               # G2 osv-scanner 配置
├── .gitleaks.toml                 # G2 gitleaks 配置
├── package.json                   # 根包，scripts 转发到 apps/web + apps/worker + packages/api
├── bun.lock
├── CLAUDE.md
├── CHANGELOG.md
└── LICENSE
```

> 根 `package.json` 的 `dev` / `build` / `typecheck` / `test` / `test:coverage` /
> `lint` 等都 fan-out 到 `apps/web`、`apps/worker`、`packages/api`、`apps/cli`；
> `gate:security` / `release` 直接调用根 `scripts/`。

`apps/web/src/` 与 `apps/worker/src/` 内部布局参见 `CLAUDE.md` 的
*Project Structure* 章节。

## 🔌 Webhook 协议

所有 webhook 端点均使用 Bearer token 认证：`Authorization: Bearer {webhook_token}`

### 验证 API Key (HEAD)

```bash
curl -I https://your-domain.example.com/api/webhook/{projectId} \
  -H "Authorization: Bearer {webhook_token}"
```

| 状态码 | 含义 |
|--------|------|
| `200` | API key 有效，可以发送备份 |
| `401` | 缺少或格式错误的 Authorization header |
| `403` | 无效的 API key 或项目不匹配 |

成功响应包含 `X-Project-Name` header。

### 查询备份状态 (GET)

```bash
curl https://your-domain.example.com/api/webhook/{projectId} \
  -H "Authorization: Bearer {webhook_token}"

# 按环境过滤
curl https://your-domain.example.com/api/webhook/{projectId}?environment=prod \
  -H "Authorization: Bearer {webhook_token}"
```

返回 JSON：

```json
{
  "project_name": "My Project",
  "environment": null,
  "total_backups": 42,
  "recent_backups": [
    {
      "id": "abc123",
      "tag": "daily-backup",
      "environment": "prod",
      "file_size": 1048576,
      "is_single_json": 1,
      "created_at": "2026-02-23T10:00:00Z"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `total_backups` | 该项目的备份总数 |
| `recent_backups` | 最近 5 条备份记录 |
| `environment` | 过滤条件（null 表示未过滤） |

### 发送备份 (POST)

```bash
curl -X POST https://your-domain.example.com/api/webhook/{projectId} \
  -H "Authorization: Bearer {webhook_token}" \
  -F "file=@backup.zip" \
  -F "environment=prod" \
  -F "tag=daily-backup"
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `file` | File | 备份文件 (.zip 或 .json)，最大 50MB |
| `environment` | String? | `dev` / `prod` / `staging` / `test` |
| `tag` | String? | 描述性标签 |

超过 50MB 时不要走这条 multipart 路径（会返回 **413**）。改用直传：

```bash
# 1. 申请 PUT URL（file_size 最大 5000000000）
curl -X POST https://your-domain.example.com/api/webhook/{projectId}/uploads \
  -H "Authorization: Bearer {webhook_token}" \
  -H "Content-Type: application/json" \
  -d '{"file_name":"dump.tar.gz","file_size":1073741824}'

# 2. 用返回的 put_url 和 headers 直传 R2（不经过 Worker）
# 3. POST .../uploads/{upload_id}/complete
```

### 恢复备份 (Restore)

```bash
# 方式 1: query param
curl https://your-domain.example.com/api/restore/{backupId}?token={webhook_token}

# 方式 2: Bearer token
curl https://your-domain.example.com/api/restore/{backupId} \
  -H "Authorization: Bearer {webhook_token}"
```

返回临时签名下载 URL（15 分钟有效）：

```json
{
  "url": "https://r2.example.com/signed-url...",
  "backup_id": "abc123",
  "project_id": "xyz789",
  "file_size": 1048576,
  "expires_in": 900
}
```

## 🛠️ 技术栈

| 组件 | 选型 |
|------|------|
| ⚡ Runtime | [Bun](https://bun.sh) (本地) + [Cloudflare Workers](https://developers.cloudflare.com/workers/) (生产) |
| 🖥️ 前端 | [Vite](https://vitejs.dev) + React 19 + [react-router](https://reactrouter.com) v7 |
| 🛣️ 后端 | [Hono](https://hono.dev) on Workers |
| 📝 Language | TypeScript (strict mode) |
| 🗄️ Metadata DB | [Cloudflare D1](https://developers.cloudflare.com/d1/) (binding) |
| 📁 File Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) (binding) |
| 🎨 UI | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| 🔐 Auth | [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/) (JWT) |
| 🚀 Deployment | `wrangler deploy` |

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 同时启动 wrangler (7018) + vite (7019) |
| `bun run build` | 生产构建 (vite → `apps/worker/static/`) |
| `bun run worker:deploy` | `wrangler deploy` 上线 worker |
| `vitest run` | 运行所有 workspace 单元测试 |
| `bun run test:coverage` | 单元测试 + 90% 覆盖率门禁 |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run lint` | Biome 检查 |
| `bun run gate:security` | 安全扫描 (osv-scanner + gitleaks) |
| `bun run release` | 版本号 + CHANGELOG + tag |

## 🧪 质量体系

L1 单元测试 + G1 静态分析由 pre-commit 执行，G2 安全扫描由 pre-push 执行：

| 层级 | 工具 | 触发时机 | 要求 |
|------|------|----------|------|
| L1 单元测试 | vitest | pre-commit | 90%+ 覆盖率 |
| G1 静态分析 | tsc + Biome | pre-commit | 0 错误 / 0 警告 |
| G2 安全扫描 | osv-scanner + gitleaks | pre-push | 0 漏洞 / 0 泄露 |

L2 (`bun run test:e2e:api`) 和 L3 (`bun run test:e2e:bdd`) 使用 `wrangler dev --local --persist-to`
全本地模拟（SQLite-backed D1/R2），零远程 CF 凭证依赖，通过 `_test_marker` 表验证安全性。

## 📄 License

[MIT](LICENSE) © 2026
