import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "happy-dom",
    globals: false,
    include: ["src/__tests__/**/*.test.{ts,tsx}"],
    pool: "threads",
    maxWorkers: 1,
    isolate: false,
    coverage: {
      provider: "v8",
      // v4: AST-aware remapping is enabled by default (was experimentalAstAwareRemapping in v3)
      reporter: ["text", "html"],
      // Mirror the previous bun gate scope: only src/lib/** is gated.
      // Pages/components live behind L3 (BDD/Playwright) and presentational
      // shadcn primitives have no logic worth surface-testing.
      include: ["src/lib/**/*.{ts,tsx}"],
      // Excludes: tests and type decls.
      exclude: ["src/__tests__/**", "src/**/*.d.ts"],
      thresholds: {
        statements: 95,
        branches: 95,
        functions: 95,
        lines: 95,
      },
    },
  },
});
