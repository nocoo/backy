<p align="center">
  <img src="assets/brand/icon-rounded.png" alt="Backy" width="128" height="128" />
</p>
<h1 align="center">Backy</h1>
<p align="center">集中接收应用备份，按项目查看内容、追踪记录，并取回原始文件。</p>
<p align="center">
  <a href="https://backy.hexly.ai">站点</a> ·
  <a href="docs/README.en.md">English</a>
</p>

## 这是什么

Backy 为应用、脚本和 AI 客户端提供统一的备份接收服务。每个项目有独立的 webhook token，发送方上传文件后，维护者可以在网页中查看记录、预览 JSON、检查失败日志，并生成下载地址。

项目运行在 Cloudflare Workers 上：Hono 提供 API 和定时任务，D1 保存元数据，R2 保存文件，Worker 同时提供 Vite / React 管理界面。Backy 负责保存和取回备份；业务数据如何导出、如何重新导入，仍由接入的应用负责。

## 功能

- **接收备份**：网页手动上传或项目 webhook 上传，保存 JSON、ZIP、gzip、tar.gz 等文件及环境、标签、来源 IP。普通上传上限为 50 MiB；更大的文件可使用 R2 直传，上限为 5,000,000,000 字节。
- **项目管理**：项目与分类、独立 token、可选 IP / CIDR 允许名单，以及可复制的集成说明。
- **内容查看**：浏览备份、查看存储统计和活动图表、预览 JSON，并从支持的压缩包中提取 JSON。预览和解压有大小限制，原始文件仍可下载。
- **取回文件**：生成临时签名下载地址或恢复命令，供应用或 AI 客户端下载原文件；不会自动修改调用方数据库。
- **自动触发与记录**：按项目配置备份回调和定时计划，查看 webhook / 定时任务日志；清理未完成直传留下的临时对象。

## 使用

打开[管理站点](https://backy.hexly.ai)，通过 Cloudflare Access 登录，创建项目并取得项目 ID 与 token。自行托管时，需要为集成路径配置合适的 Access 规则；浏览器会话与项目 token 是两套认证。

以下例子使用你自己的实例与项目，先检查 token，再上传文件：

```bash
BACKY_URL=https://backy.example.com
BACKY_PROJECT_ID=YOUR_PROJECT_ID
BACKY_TOKEN=YOUR_PROJECT_TOKEN

curl --fail-with-body --head "$BACKY_URL/api/webhook/$BACKY_PROJECT_ID" \
  -H "Authorization: Bearer $BACKY_TOKEN"
curl --fail-with-body "$BACKY_URL/api/webhook/$BACKY_PROJECT_ID" \
  -H "Authorization: Bearer $BACKY_TOKEN" \
  -F "file=@backup.json" -F "environment=dev" -F "tag=manual-backup"
```

上传成功返回备份 ID。相同地址的 GET 请求返回项目备份总数和最近记录，可用 `?environment=dev` 过滤最近记录。环境值支持 `dev`、`prod`、`staging`、`test`；环境过滤不会改变响应中的项目总数。

取回备份时，将 `BACKUP_ID` 替换为上传响应中的 ID：

```bash
curl --fail-with-body "$BACKY_URL/api/restore/BACKUP_ID" \
  -H "Authorization: Bearer $BACKY_TOKEN"
```

响应中的 `url` 是有效期 15 分钟的下载地址。下载后再调用应用自己的导入流程。大文件须使用“申请上传 → PUT 到 R2 → 完成上传”协议，见[大文件直传](docs/09-large-file-direct-upload.md)。`apps/cli` 当前仍是占位包，接入请使用 HTTP API。

## 开发

安装 Bun 和 Node.js 22.12+，然后运行：

```bash
git clone https://github.com/nocoo/backy.git
cd backy
bun install --frozen-lockfile
bun run build
```

网站构建输出到 `apps/worker/static/`，由 Worker 提供。`bun run build` 不创建数据库或部署服务。

交互开发使用下方命令，但需要先准备自己的开发资源与登录入口：

```bash
bun run dev
```

Vite 使用 `http://localhost:7017`，将 `/api/*` 转发到 7018 的 Worker。仓库 `apps/worker/wrangler.toml` 的 D1 / R2 均设置了 `remote = true`，默认命令会访问其中的远程资源。先替换成自己的开发数据库、存储桶与 Access 配置；本地 secrets 放在 `apps/worker/.dev.vars`，仓库没有对应模板。完整配置与初始化边界见[开发指南](docs/10-development.md)。

| 配置 | 用途 |
| --- | --- |
| `DB`、`R2` bindings | D1 数据库与 R2 文件存储 |
| `CF_ACCESS_TEAM_DOMAIN`、`CF_ACCESS_AUD` | 管理 API 的 Access JWT 校验；开发入口也需匹配认证方式 |
| `R2_ACCOUNT_ID`、`R2_BUCKET_NAME`、`R2_ACCESS_KEY_ID`、`R2_SECRET_ACCESS_KEY` | 下载签名、大文件上传签名与对象复制 |
| `CRON_SECRET` | 自动备份触发及其 HTTP 入口 |

普通开发不要使用测试认证开关。需要完全本地的数据库、R2 与测试身份时，使用下方仓库已有的测试 runner。

| 命令 / 路径 | 用途 |
| --- | --- |
| `bun run web:dev`、`bun run worker:dev` | 分别启动前端与 Worker |
| `bun run typecheck`、`bun run lint` | 工作区类型与代码检查 |
| `apps/web/` | 管理界面与路由 |
| `apps/worker/` | Hono 路由、Access 校验、定时任务与静态资源 |
| `packages/api/` | 备份、存储、项目、直传与日志逻辑 |

`main` 的 CI 成功后，Release 工作流构建网页、应用增量 D1 迁移并部署 Worker。`bun run worker:deploy` 只执行 Worker 部署，手动发布前仍需准备静态文件和数据库，见[部署说明](docs/10-development.md)。

## 测试

```bash
bun run test
bun run test:e2e:api
```

单元测试覆盖各工作区。API runner 使用本地 Worker、D1 和 R2，初始化 schema 并核对 `_test_marker`，运行前需保持 17018 端口空闲。直传测试使用本地 S3 接口。

```bash
bunx playwright install chromium
bun run test:e2e:bdd
```

浏览器 runner 先构建网页，同样使用 17018 端口；不要同时运行两个 runner。API 与浏览器测试分别重建 `apps/worker/.wrangler/e2e-api` 和 `apps/worker/.wrangler/e2e-bdd`，由 runner 注入测试身份。这些命令不需要远程 Cloudflare 凭据；真实 Access 登录不在模拟会话的验证范围内。

## 技术栈

| 技术 | 用途 |
| --- | --- |
| TypeScript、Bun workspaces | 共享类型、业务包与脚本 |
| Vite、React、React Router | 管理界面与前端路由 |
| Tailwind CSS、Radix UI、Recharts | 样式、交互组件与图表 |
| Hono、Cloudflare Workers | HTTP API、定时任务与静态资源 |
| Cloudflare D1 | 项目、备份、直传状态与日志 |
| Cloudflare R2、AWS S3 SDK | 文件存储、签名 URL 与对象复制 |
| Cloudflare Access、jose | 管理身份和 JWT 校验 |
| JSZip、tar-stream、zlib | 压缩包中的 JSON 提取 |
| Vitest、Bun test、Playwright | 单元、HTTP 和浏览器测试 |

## 文档

- [文档索引](docs/README.md)
- [开发、配置与部署](docs/10-development.md)
- [大文件直传协议](docs/09-large-file-direct-upload.md)
- [共享 API 包设计](docs/06-api-extraction-plan.md)
- [Vite / Worker 架构迁移](docs/07-vite-web-migration-plan.md)

## 许可证

[MIT](LICENSE)。
