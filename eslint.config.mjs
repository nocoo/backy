import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Layer tseslint strict rules on top of recommended (from nextTs)
  ...tseslint.configs.strict.map((config) => ({
    ...config,
    files: ["**/*.ts", "**/*.tsx"],
  })),
  // Test files: allow non-null assertions (standard test pattern for array/result access)
  {
    files: ["**/__tests__/**", "**/*.test.*"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  },
  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "e2e/**",
  ]),
]);

export default eslintConfig;
