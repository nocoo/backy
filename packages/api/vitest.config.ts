import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/__tests__/**/*.test.ts"],
    pool: "threads",
    maxWorkers: 1,
    isolate: false,
    setupFiles: ["./src/__tests__/setup.ts"],
    coverage: {
      provider: "v8",
      // v4: AST-aware remapping is enabled by default (was experimentalAstAwareRemapping in v3)
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Excludes: tests, package entrypoint re-exports, runtime bootstrap,
      // DB schema DDL, and thin DB wrappers covered via the adapter layer.
      exclude: [
        "src/__tests__/**",
        "src/index.ts",
        "src/runtime.ts",
        "src/**/*.d.ts",
        "src/lib/db/schema.ts",
        "src/lib/db/backups.ts",
        "src/lib/db/projects.ts",
      ],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
