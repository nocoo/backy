import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    globals: false,
    include: ["src/__tests__/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["src/**/*.ts"],
      exclude: [
        "src/__tests__/**",
        "src/index.ts",
        "src/lib/types.ts",
        "src/**/*.d.ts",
      ],
      thresholds: {
        lines: 90,
        // Routes are thin adapter shims (`c => toResponse(handler(...))`);
        // each verb is counted as a separate function so a single uncovered
        // verb hurts the ratio disproportionately. 85 here, ratchet up as
        // routes grow real branching logic.
        functions: 85,
        branches: 80,
        statements: 90,
      },
    },
  },
});
