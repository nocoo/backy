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
      // Excludes: tests, the worker entrypoint (Cloudflare Workers fetch handler
      // exercised end-to-end via E2E), shared type module, and type decls.
      exclude: [
        "src/__tests__/**",
        "src/index.ts",
        "src/lib/types.ts",
        "src/**/*.d.ts",
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
