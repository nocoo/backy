import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/__tests__/**/*.test.ts"],
    pool: "threads",
    poolOptions: { threads: { singleThread: true, isolate: false } },
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/index.ts",
        "src/runtime.ts",
        "src/**/*.d.ts",
        "src/lib/db/schema.ts",
        // Thin DB query wrappers — fully mocked in handler tests; testing
        // them directly would just re-mock the same D1 surface. Coverage
        // is via the d1-{rest,binding}-adapter tests one layer below.
        "src/lib/db/backups.ts",
        "src/lib/db/projects.ts",
        // S3 presign adapter — needs real AWS SDK + R2 endpoint; covered
        // indirectly by E2E (legacy L2 + Wave B' worker tests).
        "src/lib/r2/s3-adapter.ts",
      ],
      thresholds: {
        lines: 90,
        functions: 90,
        // Vitest now measures branches (bun:test couldn't); ratchet up to
        // 85 when extractors.ts gets the missing-archive test cases.
        branches: 80,
        statements: 90,
      },
    },
  },
});
