# 07 — Vite Web 迁移计划（Next.js → Vite SPA + Cloudflare Worker）

> Goal: 把 `apps/web`（Next.js 16 / NextAuth + Google OAuth）整体替换为
> Vite SPA + Cloudflare Worker（Hono），登录改用 **Cloudflare Access**。
> 复刻现有 `apps/web` 的全部功能，不保留 Next.js 兼容层，不做平滑迁移。
>
> 参考实现：`../surety`
> - `surety/apps/web` — Vite + React Router + SWR + Tailwind v4 + shadcn
> - `surety/apps/worker` — Hono + Cloudflare Access JWT 校验 + 静态资源托管
>
> 前置条件：Wave 1–3（`docs/06-api-extraction-plan.md`）已经完成，
> `@backy/api` 暴露了所有 framework-agnostic handlers。本计划**复用大部分
> 业务逻辑**，但会为 Worker 适配重构两处边界：① 运行时上下文（D1/R2/env/
> info 注入，详见 Wave B）② 上传/Webhook 契约（流式重写，详见 Wave B'）。
> 其余 handler 内部业务逻辑不动。

## Status legend

- ⬜ pending
- 🟡 in progress
- ✅ done

---

## 终态目录

```
apps/
  web_legacy/                 # 现 apps/web 整体重命名归档（只读、不再开发）
    ...                       # Next.js 16 + NextAuth + Google OAuth 的完整快照
  web/                        # NEW — Vite SPA（React 19 + react-router 7 + SWR）
    index.html
    vite.config.ts
    tailwind.config.ts        # 仅在 v4 需要 plugin 时；优先用 @tailwindcss/vite
    src/
      main.tsx
      App.tsx                 # react-router routes 装配
      api.ts                  # fetch wrapper（自动带 cookie，401 → 触发 Access 重登）
      app/                    # 路由对应的页面组件
        dashboard/page.tsx
        projects/{list,new,detail}/page.tsx
        backups/{list,detail}/page.tsx
        logs/page.tsx
        cron-logs/page.tsx
      components/             # 从 web_legacy 平移：layout/、ui/、charts/、project/、…
      hooks/
      lib/
        utils.ts              # cn()
        category-icons.ts
        version.ts            # import package.json
    public/
    e2e/                      # Playwright，连 wrangler dev
  worker/                     # NEW — Hono on Cloudflare Workers
    wrangler.toml
    src/
      index.ts                # Hono app 装配
      lib/
        types.ts              # AppEnv（Bindings + Variables）
      middleware/
        access-auth.ts        # CF Access JWT 校验（参考 surety）
        is-localhost.ts
        bindings.ts           # 把 c.env.DB / c.env.R2 注入到 handler 入参
      routes/
        projects.ts           # 调 @backy/api/handlers/projects.*
        backups.ts
        categories.ts
        cron.ts
        logs.ts
        webhook.ts            # public（无 Access）
        restore.ts            # public（token-auth）
        stats.ts
        live.ts
        ip-info.ts
        db.ts
        me.ts                 # GET /api/me — 返回 Access 邮箱
    static/                   # vite build 产物（apps/web 构建到此）
packages/
  api/                        # 仅做"运行时抽象"扩展，业务逻辑不动
# 注：cli 在 apps/cli（原文档曾误写为 packages/cli）
```

> 旧 `apps/web` → `apps/web_legacy`，根 `package.json` 的 workspace 通配
> `apps/*` 仍然涵盖；scripts 全量重写指向新 `apps/web` + `apps/worker`。

---

## 关键差异 vs 现状

| 维度 | 现状（Next.js） | 新方案（Vite + Worker） |
|---|---|---|
| 渲染 | Next.js App Router（SSR/RSC） | Vite SPA（纯 CSR） |
| API | `apps/web/src/app/api/**/route.ts` | `apps/worker/src/routes/*` |
| Auth | NextAuth v5 + Google OAuth + 邮箱白名单 | **CF Access**（团队 `nocoo`，aud 见下） |
| 部署 | Railway + Docker，端口 7017 | Cloudflare Workers（自定义域名 + `[assets]`） |
| 持久化 | D1（REST API）+ R2（S3 SDK） | D1（**workers binding**）+ R2（**workers binding**） |
| Cron | Cloudflare Worker → POST `/api/cron/trigger` | Worker `[triggers].crons` 直接调 handler |
| Env 注入 | `process.env` 读 `.env` | `c.env.*` 读 `wrangler.toml` `[vars]` + secrets |

### 运行时抽象（不止 D1/R2）

`@backy/api` 当前 handlers 仍存在多处与具体运行时耦合的点，**不是只换存储
adapter 就能进 Worker**。需要把以下整组依赖一次性归到一个 `RuntimeContext`
注入：

| 耦合点 | 现位置 | 注入接口 |
|---|---|---|
| D1（HTTP REST + Bearer） | `packages/api/src/lib/db/d1-client.ts` | `D1Adapter` |
| R2（`@aws-sdk/client-s3` + 预签名） | `packages/api/src/lib/r2/client.ts`，被 `handlers/backups.ts:12` 直接 import | `R2Adapter`（`put` / `get` / `delete` / `presignDownload`） |
| `process.env.*`（CRON_SECRET、CLOUDFLARE_*、R2_*、ECHO_API_URL、…） | `handlers/cron.ts:79`、`handlers/live.ts:6`、`handlers/ipInfo.ts`、`lib/r2/client.ts` 等 | `Env`（强类型 record，由 worker `c.env` 或 legacy `process.env` 填） |
| `process.uptime()` / `process.memoryUsage()` | `handlers/live.ts:89` | `RuntimeInfo`（`uptimeMs()`、`memory()`，Worker 实现返回 `null`/常量） |
| `Date.now()` 之外的时间敏感行为（cron 触发） | `handlers/cron.ts` | `Clock.now()`（可选，仅为测试可控；不强制） |
| 日志 | 各 handler 直接 `console.error` | 暂保留 `console`，但记录在边界文档里，未来可换 `logger` |

**强约束**：handler 顶层不再读 `process.*`，所有"环境/运行时事实"必须从入参拿。
做法是在 handler 入参里追加 `ctx: RuntimeContext`，或对一组相关 handler 用
工厂函数 `createXxxHandlers(ctx)` 生成。两种风格选其一并贯彻。

**Wave B 的边界因此从"DB/R2 adapter"扩到"完整 RuntimeContext"**：

```ts
// packages/api/src/runtime.ts (NEW)
export interface RuntimeContext {
  db: D1Adapter;
  r2: R2Adapter;
  env: BackyEnv;        // 强类型环境变量
  info: RuntimeInfo;    // uptime/memory，Worker 下退化
}
```

调用方：
- `apps/web_legacy` 在每个 route adapter 里构造 `ctx`（REST D1 + S3 R2 + `process.env` + Node `process`）
- `apps/worker` 在 Hono middleware 里构造 `ctx`（D1/R2 binding + `c.env` + Worker 退化版 info）

> 这是 Wave B 的真正工作量，不是"补两个 adapter"。Wave B 完成后，
> `grep -r "process\." packages/api/src` 应该只剩下注释或测试夹具。

---

## CF Access 配置

| 项 | 值 |
|---|---|
| Team | `nocoo` (`nocoo.cloudflareaccess.com`) |
| AUD  | `a920d3430b1e5a636590cd5d4f04dc657f89f9939c76a6870140015c0381d9b3` |
| 受保护路径 | `/`、`/api/*` 中除下方"公开路径"明列项外的全部 |
| 公开路径 | `POST/GET/HEAD /api/webhook/[projectId]`（自带 token）<br>`GET /api/restore/[id]`（自带 token）<br>`GET /api/live`（健康检查）<br>`POST /api/cron/trigger`（**且仅此一条** —— 自带 `CRON_SECRET` Bearer 校验） |
| 明确受保护（cron 子路径，易误公开） | `POST /api/cron/trigger/[projectId]` 必须继续走 Access。它本身**不**校验 CRON_SECRET（依赖上层认证保护，见 `apps/web_legacy/src/app/api/cron/trigger/[projectId]/route.ts`），公开等于无认证手动触发任意项目 |

`wrangler.toml` 关键片段（与 surety 对齐）：

```toml
name = "backy"
main = "src/index.ts"
compatibility_date = "2026-04-01"
compatibility_flags = ["nodejs_compat"]

routes = [
  { pattern = "your-domain.example.com", custom_domain = true },
]

[vars]
ENVIRONMENT = "production"
CF_ACCESS_TEAM_DOMAIN = "nocoo.cloudflareaccess.com"
CF_ACCESS_AUD = "a920d3430b1e5a636590cd5d4f04dc657f89f9939c76a6870140015c0381d9b3"

[[d1_databases]]
binding = "DB"
database_name = "backy-db"
database_id = "<prod>"

[[r2_buckets]]
binding = "R2"
bucket_name = "backy"

[assets]
directory = "./static"
binding = "ASSETS"
run_worker_first = ["/api/*"]
not_found_handling = "single-page-application"

[triggers]
crons = ["0 * * * *"]   # 取代现有 Cloudflare Worker cron 包

[env.test]
name = "backy-test"
[env.test.vars]
E2E_SKIP_AUTH = "true"
ENVIRONMENT = "test"
[[env.test.d1_databases]]
binding = "DB"
database_name = "backy-db-test"
database_id = "<test>"
[[env.test.r2_buckets]]
binding = "R2"
bucket_name = "backy-test"
```

中间件流（参考 `surety/apps/worker/src/middleware/access-auth.ts`）：
- 跳过 Access 的路径白名单（**精确匹配，不要用前缀通配 `/api/cron/*`**）：
  - `GET /api/live`
  - `HEAD/GET/POST /api/webhook/:projectId`
  - `GET /api/restore/:id`
  - `POST /api/cron/trigger`（自带 CRON_SECRET 校验）
- 其余 `/api/*` 一律走 Access。特别地：`POST /api/cron/trigger/:projectId` **不在白名单**。
- 本地（`isLocalhost`）跳过 Access，直接放行
- 校验 `Cf-Access-Jwt-Assertion`：`createRemoteJWKSet` + `jwtVerify`，
  issuer `https://nocoo.cloudflareaccess.com`，audience 上述 AUD
- 校验通过后写入 `c.set("accessEmail", payload.email)`，`/api/me` 据此返回
- 失败 → `401`，前端 `api.ts` 检测到 401 即 `window.location.reload()` 触发 Access 跳转

> 与 surety 不同：backy 不需要"既能 Access 又能 API key"——
> webhook/restore 自带 token、走公共路由不经 Access；其余仅 Access。

---

## 分阶段执行（5 个 Wave）

### Wave A — 重命名归档 + 工作区脚手架  ✅

1. `git mv apps/web apps/web_legacy`，包名改 `@backy/web-legacy`，标 `"private": true`。
2. 根 `package.json` scripts 复制一份"legacy"前缀（`legacy:dev`、
   `legacy:test:e2e:api`），方便回查；新 `dev` / `build` / `test` 暂留空待填。
3. `apps/web_legacy/CLAUDE.md` 写一行：**FROZEN — see docs/07**。
4. 新建空目录：`apps/web/`、`apps/worker/`，各放 `package.json` + `tsconfig.json`
   骨架。bun install 通过。
5. CI（`.github/workflows/ci.yml`）暂时只跑 legacy 路径，不影响绿。

**验收**：根 `bun install` ok；`legacy:test:coverage` + `legacy:test:e2e:api` 全绿。

### Wave B — `@backy/api` 运行时上下文抽象  ⬜

> 不只是数据层。包括 D1、R2、`process.env`、`process.uptime()`、
> CRON_SECRET 读取等所有"运行时事实"。详见上文「运行时抽象（不止 D1/R2）」。

把 D1/R2/Env/RuntimeInfo 全部从"全局/SDK 写死"抽成可注入接口：

```ts
// packages/api/src/lib/db/adapter.ts
export interface D1Adapter {
  query<T = unknown>(sql: string, params?: unknown[]): Promise<{ results: T[]; meta?: unknown }>;
}

// packages/api/src/lib/r2/adapter.ts
export interface R2Adapter {
  put(key: string, body: ArrayBuffer | ReadableStream | Uint8Array, opts?: { contentType?: string }): Promise<void>;
  get(key: string): Promise<{ body: ReadableStream; bytes: () => Promise<Uint8Array>; contentType?: string } | null>;
  delete(key: string): Promise<void>;
  presignDownload(key: string, ttlSeconds: number): Promise<string>;
}

// packages/api/src/runtime.ts
export interface BackyEnv {
  CRON_SECRET?: string;
  ECHO_API_URL?: string;
  // … 所有目前直接 process.env.X 的 key，全部在这里强类型化
}
export interface RuntimeInfo {
  uptimeMs(): number | null;   // Worker 实现可返回 null
  memory(): { rss: number; heapUsed: number } | null;
}
export interface RuntimeContext {
  db: D1Adapter;
  r2: R2Adapter;
  env: BackyEnv;
  info: RuntimeInfo;
}
```

工作量分布：
- 现 `d1-client.ts` → 收敛为 `D1Adapter` 的 REST 实现（`createRestD1Adapter(env)`）。
- 现 `r2/client.ts` → 收敛为 `R2Adapter` 的 S3 实现。
- 新建 `lib/db/d1-binding.ts`、`lib/r2/binding.ts` 给 worker 用。
- **handlers 全部改造**：每个 handler 入参追加 `ctx: RuntimeContext`，
  内部不再 import 具体客户端、不再读 `process.*`。受影响清单（最少）：
  - `handlers/backups.ts`（R2 调用 + 内存缓冲，见 Wave B' 上传特例）
  - `handlers/cron.ts`（`process.env.CRON_SECRET`）
  - `handlers/live.ts`（`process.env.*` + `process.uptime/memoryUsage`）
  - `handlers/ipInfo.ts`（`process.env.ECHO_API_URL`）
  - `handlers/webhook.ts`、`handlers/restore.ts`、其余间接经 db/r2 注入
- 回填所有 handler 测试：mock `RuntimeContext` 即可，不再 mock `fetch` / aws-sdk / `process`。
- legacy `apps/web_legacy` 在每个 route 入口构造 `ctx` 注入；新 worker 在中间件构造。

**验收**：
- `grep -r "process\." packages/api/src | grep -v __tests__` 为空（注释除外）；
- `grep -r "from \"@aws-sdk\|from 'next" packages/api/src/handlers` 为空；
- `packages/api` typecheck/lint/test:coverage 全绿，覆盖率不下降；
- legacy `apps/web_legacy` L2 e2e 仍 146/146（注入的还是 REST/S3 实现）。

### Wave B' — 上传/Webhook 流式化（特殊项）  ⬜

> Wave B 的"业务逻辑不动"原则在**上传链路**例外。当前 handler 与 Worker
> 的 CPU/内存上限不兼容，必须重新设计契约。

**当前问题**（`packages/api/src/handlers/backups.ts:163-224`、
`handlers/webhook.ts` ingest 路径）：
- `uploadBackupHandler` 接受 `FormData`，对 `File` 调 `arrayBuffer()` 全量读入。
- 单 JSON 输入会用 `JSZip` 在内存里压缩（再次复制一份）。
- webhook ingest 也是 `formData` + 全量 `arrayBuffer`。
- Worker 标准计划：单请求 ≤128MB 内存、≤30s CPU；50MB 文件经过两次 buffer 拷贝就接近上限，且 JSZip 全内存压缩会进一步放大峰值。

**决策：采用路线 2（流式重写），路线 1 仅作为 Wave B' 实施期间被证伪时的 fallback 注记。**

- **路线 2（决策项）**：
  - 新增 handler 入口 `uploadBackupStreaming({ projectId, fileName, contentType, size, body: ReadableStream, … }, ctx)`，**不再接 FormData**；
  - Web 端：用 `fetch` 直接 `PUT/POST` 二进制，Content-Type/X-File-Name/X-Tag/… 走 header；
  - Worker 端：从 `c.req.raw.body` 拿 `ReadableStream`，直通 `R2Adapter.put` 流接口；
  - 旧 `uploadBackupHandler`（FormData 缓冲版）保留，仅给 `web_legacy` 用，并标 `@deprecated`；
  - "单 JSON → 自动 zip 后上传"这条分支需要拆：要么客户端上传前 zip，要么服务端用 streaming gzip（`CompressionStream`），不再 `JSZip` 全内存；
  - webhook ingest 同样改成读 raw body，token/projectId 走 path/header。

- **路线 1（fallback only）**：仅当路线 2 在实施过程中被证伪（例如 R2 binding 流式 put 行为有坑、或 `CompressionStream` 在 Worker 上不可用）才回退。回退方式：保留缓冲上传契约，把 `MAX_FILE_SIZE` 从 50MB 砍到 ≤20MB，并在 retrospective 记录原因。**默认实现路径不走这条**。

**协议变更影响清单（路线 2 必须一并改，缺一项 Wave B' 不算完）**：

| 消费者 / 文案 / 测试 | 位置 | 改造内容 |
|---|---|---|
| 手动上传 UI | `apps/web_legacy/src/components/manual-upload-dialog.tsx:157` 当前发 `multipart/form-data` | 新 `apps/web` 复刻该组件时直接走流式 PUT；legacy 版本保留 FormData，但调用旧 handler |
| Project prompt 生成器 | `packages/api/src/handlers/projects-prompt.ts:188 / :255 / :279` 当前输出 `multipart/form-data`、50MB、`FormData` 示例 | 改输出 `application/octet-stream` PUT 示例 + 新上限值 + header 字段说明；prompt 是给 AI agent 看的，必须同步 |
| 外部 AI agent 文档 | `README.md` 的 webhook 上传示例（如有 curl 段） | 同步改为流式 PUT |
| L2 e2e 上传 case | `apps/web_legacy/e2e/api/suites/` 中 `upload*` / `webhook*` 套件 | 新增针对流式入口的 case；旧 FormData case 仅在 legacy 套件保留 |
| L3 BDD spec | `apps/web_legacy/e2e/bdd/specs/` 含上传流程的 spec | 新 `apps/web/e2e/` 改用流式 fetch；spec 文案同步 |
| `MAX_FILE_SIZE` 常量 | `packages/api/src/handlers/backups.ts` | 路线 2 下保持或上调；如 fallback 路线 1，则降到 ≤20MB |

**验收**（在原条目基础上新增）：
- 上述 6 项消费者/文档/测试**全部**已更新（PR 描述里列出 checkbox），不允许"半改"；
- 上传 30MB 文件不触发 Worker 内存告警（miniflare 本地 + 生产抽样）；
- L2 e2e 上传相关 case 全绿；
- 旧 FormData handler 仅 `web_legacy` 还在用；新 worker 路由不引用它；
- `bun run grep -F "multipart/form-data" apps/web/ apps/worker/ packages/api/src/handlers/projects-prompt.ts` 无遗留（legacy 目录除外）。

### Wave C — `apps/worker`（Hono + CF Access）  ⬜

1. 装配 Hono：`secureHeaders` + `accessAuth`（移植 surety 实现，AUD/team 改 backy）。
2. 路由文件按 `@backy/api` handler 一一对应：
   - `routes/projects.ts` → 调 `projectsHandlers.list/create/get/...`
   - 同理：backups / categories / cron / logs / stats / live / ip-info / db / restore / webhook
3. 注入：用 `dbMiddleware` 类似的写法把 `c.env.DB` / `c.env.R2` 适配到
   `D1Adapter` / `R2Adapter`，再进 handlers。
4. `routes/me.ts`：返回 `c.get("accessEmail")`，前端用它显示登录用户。
5. `[triggers].crons` → 直接调 `cronTriggerHandler`，不再走 HTTP。
6. 单测：每条路由起码 1 个 happy + 1 个 401/auth。
7. 本地：`bun --cwd apps/worker dev`（`wrangler dev --port 7018` + `--local` D1/R2 仿真）。

**验收**：
- `wrangler dev` 起得来，`curl /api/live` 200；
- 带 `E2E_SKIP_AUTH=true` 跑 L2 e2e（指向 worker）146/146；
- `grep -r "next/server\|NextResponse" apps/worker/src` → 空。

### Wave D — `apps/web`（Vite SPA）  ⬜

1. 套用 surety 的脚手架：`vite.config.ts` + `@tailwindcss/vite` + `react@19` + `react-router@7` + `swr`。
2. 路由表对齐 Next.js App Router 现有页面：
   - `/` → Dashboard
   - `/login` 删除（Access 接管登录跳转）
   - `/projects`、`/projects/new`、`/projects/:id`
   - `/backups`、`/backups/:id`
   - `/logs`、`/cron-logs`
3. 数据层：`src/api.ts` 用 `fetch`（默认 `credentials: "include"`），SWR key 即 URL。
4. 组件平移：`components/{layout,ui,charts,project,...}` 从 `web_legacy` 直接 `cp -R`，
   按 React 19/router 7 调整：
   - 去掉 `"use client"`
   - `next/link` → `react-router` 的 `<Link>`
   - `next/image` → `<img>`（D1/R2 来源都是直链）
   - `next/navigation` 的 `useRouter` → `useNavigate`
5. 主题：保留现有 FOUC 预防方案（root layout 注入小段脚本，迁到 `index.html`）。
6. 构建：`vite build --outDir ../worker/static`，worker `[assets]` 直接托管。
7. **Auth 替换专项**（不是删一个文件就完事）：

   当前 NextAuth 渗透点（必须逐一处理，不能漏）：
   - `apps/web_legacy/src/app/layout.tsx:4` 根布局挂 `<AuthProvider>`，全局 session context；
   - `apps/web_legacy/src/components/auth-provider.tsx`（NextAuth `SessionProvider` 包装）；
   - `apps/web_legacy/src/components/layout/sidebar.tsx:7` 直接读 `useSession()` 渲染头像/邮箱/登出按钮；
   - `apps/web_legacy/src/proxy.ts:21` Next.js proxy 承载未登录跳 `/login`、已登录跳首页等重定向规则；
   - `apps/web_legacy/src/app/login/page.tsx`（Google OAuth 触发页）；
   - 整套 `next-auth` / `@auth/core` 依赖 + Google OAuth client id/secret 环境变量。

   新方案（CF Access 接管）：
   - **身份信息显示**：`useMe()` SWR hook 拉 `/api/me` → `{ email }`，sidebar 用此渲染。Loading 给 skeleton；error/401 触发"重新登录"动作。
   - **登出行为**：CF Access 登出走 `https://nocoo.cloudflareaccess.com/cdn-cgi/access/logout`，sidebar"登出"按钮 `<a href>` 直链，不写 client 逻辑。登出后 Access 会重定向回首页。
   - **SPA 受保护路由**：react-router 顶层包一层 `<RequireAuth>`，行为 = 调 `useMe()`，未拿到 email 则显示 "Redirecting to login…" + 触发刷新（CF Access 中间件会 302 到 SSO）。**不要在前端做 token 校验**——Access 在 worker 边缘已经挡住未授权请求。
   - **路由重定向**：删除原 `proxy.ts` 全部逻辑。`/login` 路由不存在，访问根域名时 Access 未登录 → CF 跳 SSO；已登录 → SPA 接管。Wave D 不需要复刻任何 `proxy.ts` 行为。
   - **E2E 绕过策略**：`apps/worker` 在 `wrangler.toml` `[env.test]` 设 `E2E_SKIP_AUTH=true`，`accessAuth` 中间件检测到该 env 直接放行并 mock `accessEmail = "e2e@local.test"`。Playwright 直接打 worker test 域名，不需要前端做特殊处理。
   - **本地开发**：`isLocalhost(c)` 短路 + `c.set("accessEmail", "dev@local")`，`useMe()` 拿到 dev 邮箱，UI 与生产一致。
8. 删除：`auth-provider.tsx`、`login/page.tsx`、`proxy.ts`；`package.json` 移除 `next-auth`/`@auth/core` 与 Google OAuth 相关 env doc。
9. `package.json` 删除 `next`、`next-auth`、`@auth/core`、`@aws-sdk/*`、`jszip`、
   `tar-stream`、`nanoid`（这些都被 `@backy/api` 包住了）。

**验收**：
- `bun --cwd apps/web dev` + `bun --cwd apps/worker dev` 联调，所有页面渲染、CRUD 跑通；
- L3 Playwright 5 个 spec 全绿（runner 改起 vite + wrangler 双进程）；
- 无 console error / 404；FOUC 不闪。

### Wave E — 部署 + 收尾  ⬜

1. `wrangler deploy --env=test` 验 staging（test D1/R2、test 域名）。
2. `wrangler deploy` 上线生产；DNS 切到 worker route，下掉 Railway 服务。
3. 删除：
   - 现 `apps/web/worker/`（旧 cron worker）
   - Railway / Docker 相关：`Dockerfile`、`railway.json`、`apps/web_legacy/Dockerfile`
   - CLAUDE.md 里的 "Railway + Docker, 7017" 表行
4. CI 切换：`.github/workflows/ci.yml` 改跑新 `apps/web` + `apps/worker` 的 typecheck/lint/test；
   `web_legacy` 路径只在显式 workflow_dispatch 时跑，半年后整目录删。
5. 文档同步：`README.md`、`CLAUDE.md`（端口表、Tech Stack 表、Project Structure）、
   `docs/01-design.md` 全量更新。

**验收**：
- 生产域名走 Access，未登录访问跳 nocoo team 登录页；
- 登录后所有功能与现状一致；
- webhook / restore 端点不经 Access，外部 AI agent 调用不受影响；
- `gate:security` 清单更新（去 next/next-auth/aws-sdk，加 hono/jose/wrangler）。

---

## 已知风险 / 注意事项

| 风险 | 缓解 |
|---|---|
| Webhook/Upload 大文件在 Worker 触发 CPU/内存上限 | **不能仅靠"在入口流式转发"概括** —— 现 handler 是 FormData + 全量 buffer + JSZip 内存压缩。详见 Wave B' 单列方案（路线 1 砍上限 / 路线 2 重写为流式契约） |
| D1 binding 的 SQL 语法 vs REST 微差 | adapter 一层吃掉；测试用 miniflare 本地 D1 跑一遍 schema init |
| Cron 触发时没有 Request 上下文 | `scheduled()` handler 直接 `cronTriggerHandler({...})`，不再依赖 HTTP |
| Vite SPA 没有 SSR，首屏需要等 JS | 业务是后台工具，可接受；关键页面给 skeleton |
| Access 在本地开发不可用 | `accessAuth` 检测 `isLocalhost` 直接放行 + `c.set("accessEmail", "dev@local")` |
| `web_legacy` 与新 web 构建产物冲突 | 各自独立 outDir；CI 只构新 web |

---

## 下三步（Wave A 后立刻能做）

1. **Wave A 落地**：物理重命名 + 脚手架，确保 legacy 还能跑（CI 文件 `ci.yml` 暂只跑 legacy）。
2. **Wave B 落地**：完整 `RuntimeContext` 抽象（D1/R2/env/info），handlers 全部去 `process.*`、去 SDK 直 import；回填测试。
3. **Wave B' 上传链路**：按路线 2（流式重写）实现 —— 新 `uploadBackupStreaming` 入口、Web/Worker 端流式 PUT、`CompressionStream` 替代 JSZip、消费者/文案/测试 6 项一并改。仅在路线 2 被证伪时回退路线 1（砍 `MAX_FILE_SIZE` 到 ≤20MB）并记 retrospective。

> 完成上述三步后，再起 Wave C（`apps/worker` 装配 Hono + Access + `/api/live` + `/api/me`）。
