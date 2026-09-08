# 开发、配置与接入

项目概览和完整英文说明见[中文 README](../README.md)与[English README](README.en.md)。本文补充当前 Worker / Vite 架构下的配置和运行边界。

## 本地验证与交互开发

Bun 管理整个 workspace，根目录 `bun install --frozen-lockfile` 会安装 web、worker、api、cli 包。当前 Vite 与 Wrangler 组合需要 Node.js 22.12+。`apps/cli` 只会输出占位提示，没有备份管理子命令。

完全本地的入口是根 README 中的 `test:e2e:api` 和 `test:e2e:bdd`：显式 `wrangler dev --local --persist-to` 禁用远程绑定，分别使用 `apps/worker/.wrangler/e2e-api` / `e2e-bdd`，并注入测试认证与 `_test_marker` 检查。runner 在结束时停止自己的服务。`_test_marker` 由 schema 初始化器写入，不能单凭它判断数据库是否隔离；必须同时保持本地启动参数和独立状态目录。

交互开发的 `bun run dev` 则启动 `wrangler dev --port 7018` 和 Vite 7017。由于配置中的 D1 / R2 均为 `remote = true`，此模式会访问所配置的远程资源。按实际用途配置自己的开发资源，避免把现有生产资源作为试验数据库。

普通管理请求由 Access JWT 验证。源码只在请求没有 `request.cf` 且 Host 为 loopback 时使用本地快捷路径；本地 workerd 也可能提供 `request.cf`，因此仅使用 localhost 不能保证跳过认证。需要交互访问时，让自己的开发网关完成 Access 登录并转发有效 JWT。`E2E_SKIP_AUTH` 只由隔离测试 runner 使用。

## 配置位置

当前仓库没有 `.dev.vars.example`。本地服务端秘密配置放在 `apps/worker/.dev.vars`；部署后用 Worker secrets 设置对应字段。不要在前端环境变量中放 R2 凭据。

| 位置 / 字段 | 用途 |
| --- | --- |
| `apps/worker/wrangler.toml` 的 `DB` / `R2` | 自己的数据库与存储桶；名称和 ID 需要匹配 |
| `[vars]` 的 `CF_ACCESS_TEAM_DOMAIN` / `CF_ACCESS_AUD` | Cloudflare Access 团队域和应用 audience |
| `R2_ACCOUNT_ID` / `R2_BUCKET_NAME` | S3 接口使用的账号与存储桶，需与 binding 指向相同桶 |
| `R2_ACCESS_KEY_ID` / `R2_SECRET_ACCESS_KEY` | 下载 / 上传签名与完成直传时的 CopyObject |
| `CRON_SECRET` | 自动备份触发认证；定时事件调用同一 handler，也需要它 |
| `ALLOWED_HOSTS` / `SSRF_ALLOWLIST` | 自定义反向代理主机和回调目标限制，按当前校验逻辑配置 |
| `ECHO_API_URL` / `ECHO_API_KEY` | 可选的 IP 信息查询服务 |

R2 binding 可以保存、读取和删除对象，但不能单独生成 S3 签名；只有绑定而没有签名凭据时，普通上传可用，下载签名和直传仍不可用。API 测试 runner 会覆盖凭据和 S3 endpoint，使用本地 R2 S3 模拟接口；生产不要使用这些测试端点。

## 接入路径与认证

仪表盘、项目 / 备份管理和单项目手动触发由 Access 保护。外部应用使用项目 token 访问以下路径；还需让边缘 Access 策略允许这些具体集成路径抵达 Worker。Worker 内部豁免不会改变边缘策略。

| 方法与路径 | 行为 |
| --- | --- |
| `HEAD /api/webhook/:projectId` | 校验 Bearer token、项目匹配与 IP 允许名单 |
| `GET /api/webhook/:projectId` | 项目总备份数与最近记录；environment 仅过滤最近记录 |
| `POST /api/webhook/:projectId` | multipart `file`，可选 `environment` 和 `tag` |
| `POST /api/webhook/:projectId/uploads` | 申请 R2 直传 |
| `POST /api/webhook/:projectId/uploads/:uploadId/complete` | 验证临时对象、复制到最终位置并记录备份 |
| `DELETE /api/webhook/:projectId/uploads/:uploadId` | 中止尚可中止的上传 |
| `GET /api/restore/:backupId` | 用项目 token 生成原文件签名下载 URL |
| `POST /api/cron/trigger` | 以 `CRON_SECRET` Bearer 触发到期项目；不是管理端单项目触发入口 |

恢复接口也接受 `?token=`，示例优先使用 Authorization header。返回值是 JSON，其中 `url` 有效 900 秒；应用还需下载、验证并执行自己的导入流程。

## 文件限制与直传

| 操作 | 当前限制 |
| --- | --- |
| 网页 / webhook 普通上传 | 50 MiB |
| R2 单次直传 | 5,000,000,000 字节 |
| JSON 在线预览 | 5 MiB |
| 压缩包提取 | 原压缩包及解压处理有 50 MiB 限制；提取 JSON 有 10 MiB 限制，预览仍受 5 MiB 限制 |

原文件按格式保存，支持识别 JSON、ZIP、gzip、tar.gz / tgz，也可保存其他二进制文件。压缩包提取只选择一个 JSON 文件，具体格式处理见 `packages/api/src/lib/backup/extractors.ts`，并非完整的压缩包文件浏览器。

直传初始化需要 basename `file_name` 和准确的 `file_size`，可选 `content_type`、`environment`、`tag`。拿到 `put_url` 后，以返回的 **全部 headers** 执行 PUT，再携带项目 Bearer token 调用 complete。仅完成 PUT 不会产生可取回的最终备份。服务还会限制未完成上传数量与累计字节，见[完整协议](09-large-file-direct-upload.md)。

直传采用临时对象到最终对象的复制，要求 S3 签名 / CopyObject 配置。`direct-staging/` 生命周期规则和每小时清理任务共同回收临时数据；`apps/worker` 的 `r2:lifecycle` 命令写死了当前存储桶名，自行托管要先改为自己的桶。

## 自动备份

项目可配置回调地址、认证 header 和 1 / 12 / 24 小时间隔。Worker 每小时运行，按 UTC 小时整除间隔来选择项目；不是从项目创建时间开始计时。触发只向接入应用发送 POST，应用仍负责生成文件并推回 Backy。HTTP 成功记录表示回调成功，不等于已经收到新的备份文件。

## 数据库与部署

`bun run build` 只构建 SPA。已有数据库的增量迁移位于 `apps/worker/migrations/`，当前迁移依赖基础 `projects` / `backups` 表，不能用它单独初始化全新生产库。

基础 schema 与本地初始化逻辑位于 `packages/api/src/lib/db/schema.ts`；隔离 runner 使用 `/api/db/init` 初始化测试库。生产发布不调用该接口，也不会重建基础表。新实例需要先根据当前 schema 准备自己的基础数据库，再应用适用的增量迁移；不要把历史 Next.js / Railway 文档当成当前一键部署步骤。

当前 [.github/workflows/release.yml](../.github/workflows/release.yml) 在 main CI 成功后构建 SPA、应用生产 D1 增量迁移，再部署 Worker，并核对版本。手动 `bun run worker:deploy` 只执行 Wrangler deploy，不包括构建或迁移。域名、Access、D1 / R2 和 secrets 均需事先配置到自己的账号。

## 代码与文档导航

- `apps/web/`：React SPA；Vite 将产物写入 `apps/worker/static/`。
- `apps/worker/`：Hono 路由、认证与 binding 适配；`scheduled()` 调用备份触发和直传清理。
- `packages/api/`：与宿主分离的业务 handlers、D1 / R2 接口及格式处理。
- [共享 API 提取计划](06-api-extraction-plan.md)和[Vite 迁移计划](07-vite-web-migration-plan.md)保留重构背景。
- [旧隔离设计](05-test-resource-isolation.md)是历史远程测试方案；当前测试以本地 runner 为准。
