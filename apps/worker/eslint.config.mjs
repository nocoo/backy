import { defineConfig, globalIgnores } from "eslint/config";
import tseslint from "typescript-eslint";

const eslintConfig = defineConfig([
  ...tseslint.configs.strict.map((config) => ({
    ...config,
    files: ["**/*.ts"],
  })),
  {
    files: ["**/__tests__/**", "**/*.test.*"],
    rules: {
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  globalIgnores(["node_modules/**", "dist/**", "scripts/**"]),
]);

export default eslintConfig;
