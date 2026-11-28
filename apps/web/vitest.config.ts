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
    allowOnly: false,
    passWithNoTests: false,
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
      // Mirror the previous bun gate scope: only src/lib/**/*.ts is gated.
      // Pages/components/TSX views live behind L3 (BDD/Playwright) and
      // presentational shadcn primitives have no logic worth surface-testing.
      include: ["src/lib/**/*.ts"],
      // Excludes: tests, TSX views/components, auth/SWR hook, and type decls.
      exclude: ["src/__tests__/**", "src/**/*.d.ts", "src/**/*.tsx", "src/lib/useMe.ts"],
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
    },
  },
});
