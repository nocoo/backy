import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    allowOnly: false,
    passWithNoTests: false,
    environment: "node",
    globals: false,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      // v4: AST-aware remapping is enabled by default (was experimentalAstAwareRemapping in v3)
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      // Excludes: tests, type decls, and the bin entrypoint (thin shell wrapper)
      exclude: ["src/__tests__/**", "src/**/*.d.ts", "src/bin.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
