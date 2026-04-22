import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Layer tseslint strict rules on top of recommended (from nextTs).
  // nextTs already registers the @typescript-eslint plugin, so strip the
  // plugins key from each strict config to avoid "Cannot redefine plugin".
  ...tseslint.configs.strict.map((config) => {
    const { plugins, ...rest } = config;
    void plugins;
    return { ...rest, files: ["**/*.ts", "**/*.tsx"] };
  }),
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
