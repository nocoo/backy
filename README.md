<p align="center">
  <img src="public/logo-80.png" alt="Backy Logo" width="80" height="80">
</p>

<h1 align="center">Backy</h1>

<p align="center">
  <strong>AI 备份管理服务</strong><br>
  接收 · 存储 · 预览 · 恢复
</p>

<p align="center">
  <img src="https://img.shields.io/badge/Next.js-16-black" alt="Next.js">
  <img src="https://img.shields.io/badge/TypeScript-5-blue" alt="TypeScript">
  <img src="https://img.shields.io/badge/Cloudflare-D1%20%2B%20R2-orange" alt="Cloudflare">
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

### 2️⃣ 配置环境变量

```bash
cp .env.example .env
```

编辑 `.env` 文件，配置以下内容：

```bash
# Google OAuth 配置 (从 Google Cloud Console 获取)
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-your-client-secret

# NextAuth 密钥 (生成命令: openssl rand -base64 32)
NEXTAUTH_SECRET=your-generated-secret-here

# 允许登录的邮箱列表 (逗号分隔)
ALLOWED_EMAILS=your-email@gmail.com

# Cloudflare D1 (元数据数据库)
D1_ACCOUNT_ID=your-cloudflare-account-id
D1_DATABASE_ID=your-d1-database-id
D1_API_TOKEN=your-d1-api-token

# Cloudflare R2 (文件存储)
R2_ACCOUNT_ID=your-cloudflare-account-id
R2_ACCESS_KEY_ID=your-r2-access-key
R2_SECRET_ACCESS_KEY=your-r2-secret-key
R2_BUCKET_NAME=your-bucket-name
```

> 💡 **提示**: Google OAuth 回调地址设置为 `http://localhost:7026/api/auth/callback/google`

### 3️⃣ 启动开发服务器

```bash
bun dev
```

打开浏览器访问 👉 [http://localhost:7026](http://localhost:7026)

## 📁 项目结构

```
backy/
├── 📂 docs/                        # 项目文档
│   └── 01-design.md                # 设计文档
├── 📂 public/                      # 静态资源 (logo, favicon)
├── 📂 scripts/                     # 工具脚本
│   ├── e2e-tests.ts                # E2E 测试用例 (34 tests)
│   ├── run-e2e.ts                  # E2E 运行器 (port 17026)
│   ├── check-coverage.ts           # 测试覆盖率检查
│   └── resize-logo.py              # Logo 处理脚本
├── 📂 src/
│   ├── 📂 __tests__/               # 单元测试 (71 tests)
│   │   ├── d1-client.test.ts       # D1 REST 客户端
│   │   ├── webhook.test.ts         # Webhook 端点 (HEAD + GET + POST)
│   │   ├── proxy.test.ts           # 认证代理中间件
│   │   ├── ip.test.ts              # IP/CIDR 验证
│   │   ├── id.test.ts              # nanoid 生成
│   │   ├── health.test.ts          # 健康检查
│   │   └── utils.test.ts           # 工具函数
│   ├── 📂 app/                     # Next.js App Router
│   │   ├── 📂 api/                 # API 路由
│   │   │   ├── 📂 webhook/         # Webhook 接收 (HEAD + GET + POST)
│   │   │   ├── 📂 projects/        # 项目 CRUD + token + prompt
│   │   │   ├── 📂 backups/         # 备份管理 + 预览 + 下载 + 提取
│   │   │   ├── 📂 restore/         # 恢复端点 (公开, token 认证)
│   │   │   ├── 📂 stats/           # 仪表盘统计 + 图表数据
│   │   │   ├── 📂 auth/            # NextAuth 处理
│   │   │   └── 📂 live/            # 健康检查
│   │   ├── 📂 backups/             # 备份列表 + 详情页
│   │   ├── 📂 projects/            # 项目列表 + 详情页
│   │   ├── 📂 login/               # 登录页面
│   │   ├── layout.tsx              # 根布局
│   │   └── page.tsx                # 仪表盘 (首页)
│   ├── 📂 components/              # UI 组件
│   │   ├── 📂 layout/              # 布局组件 (Sidebar 等)
│   │   ├── 📂 charts/              # 仪表盘图表 (Recharts)
│   │   ├── 📂 ui/                  # shadcn/ui 基础组件
│   │   ├── json-tree-viewer.tsx    # JSON 树形预览
│   │   └── loading-screen.tsx      # 加载画面
│   ├── 📂 lib/                     # 核心逻辑
│   │   ├── 📂 db/                  # D1 数据库层 (REST API)
│   │   │   ├── d1-client.ts        # Cloudflare D1 HTTP 客户端
│   │   │   ├── schema.ts           # Schema 定义 + 迁移
│   │   │   ├── projects.ts         # 项目 CRUD
│   │   │   └── backups.ts          # 备份 CRUD
│   │   ├── 📂 r2/                  # R2 存储层 (S3 API)
│   │   │   └── client.ts           # 上传 / 下载 / 签名 URL
│   │   ├── id.ts                   # nanoid 生成器
│   │   ├── ip.ts                   # IP/CIDR 验证
│   │   └── utils.ts                # 通用工具 (cn, formatBytes)
│   ├── auth.ts                     # NextAuth 配置
│   └── proxy.ts                    # 认证代理中间件
├── .env.example                    # 环境变量示例
├── Dockerfile                      # Docker 容器化 (3-stage build)
├── railway.json                    # Railway 部署配置
└── package.json
```

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
| ⚡ Runtime | [Bun](https://bun.sh) |
| 🖥️ Framework | [Next.js 16](https://nextjs.org) (App Router) |
| 📝 Language | TypeScript (strict mode) |
| 🗄️ Metadata DB | [Cloudflare D1](https://developers.cloudflare.com/d1/) (remote REST API) |
| 📁 File Storage | [Cloudflare R2](https://developers.cloudflare.com/r2/) (S3-compatible) |
| 🎨 UI | [Tailwind CSS v4](https://tailwindcss.com) + [shadcn/ui](https://ui.shadcn.com) |
| 🔐 Auth | [NextAuth v5](https://next-auth.js.org) (Google OAuth + 邮箱白名单) |
| 🚀 Deployment | [Railway](https://railway.com) + Docker |

## 📋 常用命令

| 命令 | 说明 |
|------|------|
| `bun dev` | 启动开发服务器 (端口 7026) |
| `bun run build` | 生产构建 |
| `bun start` | 启动生产服务器 |
| `bun test` | 运行单元测试 (486 tests) |
| `bun run test:coverage` | 单元测试 + 90% 覆盖率门禁 |
| `bun run test:e2e:api` | API E2E 测试 (146 tests, port 17026) |
| `bun run test:e2e:bdd` | Playwright E2E 测试 (5 specs, port 27026) |
| `bun run typecheck` | TypeScript 类型检查 |
| `bun run lint` | ESLint 检查 |
| `bun run gate:security` | 安全扫描 (osv-scanner + gitleaks) |

## 🧪 质量体系

三层测试 + 两道门控。L1/G1 由 pre-commit 执行，L2/G2 由 pre-push 执行，L3 按需运行：

| 层级 | 工具 | 触发时机 | 要求 |
|------|------|----------|------|
| L1 单元测试 | bun test | pre-commit | 90%+ 覆盖率，486 tests |
| L2 API E2E | BDD 自举测试 | pre-push | 146 tests 全部通过 |
| L3 系统 E2E | Playwright | 按需 | 5 specs 全部通过 |
| G1 静态分析 | tsc + ESLint | pre-commit | 0 错误 / 0 警告 |
| G2 安全扫描 | osv-scanner + gitleaks | pre-push | 0 漏洞 / 0 泄露 |

E2E 测试使用**独立的测试资源**（D1: `backy-db-test`，R2: `backy-test`），通过 `.env.test` 覆盖生产凭据，确保测试永远不会触及生产数据。`backy-test` 项目由 seed 端点自动创建和维护。通过 `E2E_SKIP_AUTH=true` 在本地绕过 OAuth。详见 `.env.example` 中的配置说明。

## 📄 License

[MIT](LICENSE) © 2026
