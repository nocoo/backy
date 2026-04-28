# Autoresearch: UT 质量优化（保持覆盖率，提升意义/性能/稳定性）

## Objective
在不降低单元测试覆盖率（lines/branches/functions/statements 阈值）的前提下，
提升整套 vitest 单元测试的：

1. **运行性能**：`bun run test`（不含 coverage）的总耗时
2. **稳定性**：多次运行的耗时方差 + 不出现 flake/失败
3. **意义**：减少“弱测试”（无断言、只断言 truthy/`toBeDefined`、重复 case、
   断言全是 mock 自身、`.skip`/`.todo`、空 `it` 等）

覆盖率作为**硬约束**（`autoresearch.checks.sh` 跑 `bun run test:coverage` +
`bun run typecheck`）。覆盖率阈值见各包 `vitest.config.ts`：
- `packages/api`: lines/funcs/statements 90、branches 80
- `apps/worker`: lines/statements 90、funcs 85、branches 80
- `apps/web`: lines/funcs/statements 95、branches 90（仅 `src/lib/**`）

## Metrics
- **Primary**: `total_ms` — `bun run test` 全套（web+api+worker+cli）
  连续 5 次运行的**中位数耗时**（毫秒，越低越好）
- **Secondary**:
  - `stddev_ms` — 5 次耗时标准差（稳定性，越低越好）
  - `weak_tests` — 弱测试条数（脚本扫描，越低越好）
  - `test_count` — 总测试用例数（仅监控，不应大幅下降）
  - `coverage_min_pct` — 三个包 lines 覆盖率最小值（监控）

## How to Run
`./autoresearch.sh` — 输出 `METRIC name=value` 行。
约束检查：`./autoresearch.checks.sh`（自动在 benchmark 通过后执行）。

## Files in Scope
所有 vitest 单测文件 + 必要的测试 helpers：

- `apps/web/src/__tests__/**/*.test.{ts,tsx}` (12 文件 / 75 cases)
- `apps/worker/src/__tests__/**/*.test.ts` (5 文件 / 80 cases)
- `packages/api/src/__tests__/**/*.test.ts` (26 文件 / 488 cases)
- `apps/cli/**/*.test.ts` (1 文件 / 5 cases)
- `apps/{web,worker}/vitest.config.ts`、`packages/api/vitest.config.ts`
  （可调 pool/threads/isolate 等性能选项；**禁止降低 coverage 阈值**）
- `scripts/scan-weak-tests.ts`（本 session 创建）

可以新增/合并/删除测试文件，前提是覆盖率阈值不被打破。

## Off Limits
- **生产代码** `apps/*/src/**`（除 `__tests__` 子目录）、
  `packages/api/src/**`（除 `__tests__`）—— 不允许通过修改实现来作弊
  地满足覆盖率/通过率。
- vitest 配置中 `coverage.thresholds` / `include` / `exclude` —— 不能放水。
- `apps/web_legacy/**`（已冻结，跑不到）。
- E2E (`e2e/**`, `scripts/run-e2e.ts`)。

## Constraints
- `bun run test:coverage` 必须通过（覆盖率阈值 + 全部用例 pass）。
- `bun run typecheck` 必须通过。
- 任何一次 5 连跑出现 flake/失败 = 视为 crash/checks_failed。
- `test_count` 不允许下降超过 10%（避免靠删测试刷速度）。
- 不能通过把测试改成 `.skip`/`.todo` 来加速。
- 不能新增运行时依赖（dev-deps 谨慎，需要在 commit 说明里写明原因）。

## What's Been Tried
（每次 keep 后追加要点）

baseline: 见首次 init。
