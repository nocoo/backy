import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    pool: "threads",
    globals: true,
    projects: [
      {
        extends: "./packages/api/vitest.config.ts",
        test: { sequence: { groupOrder: 0 }, root: "./packages/api" },
      },
      {
        extends: "./apps/worker/vitest.config.ts",
        test: { sequence: { groupOrder: 1 }, root: "./apps/worker" },
      },
      {
        extends: "./apps/web/vitest.config.ts",
        test: { sequence: { groupOrder: 2 }, root: "./apps/web" },
      },
      {
        extends: "./apps/cli/vitest.config.ts",
        test: { sequence: { groupOrder: 3 }, root: "./apps/cli" },
      },
    ],
    coverage: {
      provider: "v8",
      experimentalAstAwareRemapping: true,
      reporter: ["text", "html"],
      include: [
        "apps/web/src/**",
        "apps/worker/src/**",
        "apps/cli/src/**",
        "packages/api/src/**",
      ],
      exclude: [
        "**/*.test.ts",
        "**/*.d.ts",
        "**/*.tsx",
        "**/__tests__/**",
        "**/index.ts",
        "**/types.ts",
        "**/hooks/**",
        "**/e2e/**",
        "**/*auth*",
        "**/*Auth*",
        "packages/api/src/runtime.ts",
        "packages/api/src/lib/db/schema.ts",
        "packages/api/src/lib/db/backups.ts",
        "packages/api/src/lib/db/projects.ts",
        "packages/api/src/lib/r2/s3-adapter.ts",
        "apps/cli/src/bin.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 90,
        functions: 95,
        lines: 95,
      },
    },
  },
});
