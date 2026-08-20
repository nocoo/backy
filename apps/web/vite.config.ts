import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

const rootPkg = JSON.parse(
  readFileSync(path.resolve(__dirname, "../../package.json"), "utf8"),
) as { version: string };

export default defineConfig({
  plugins: [react(), tailwindcss()],
  define: {
    __APP_VERSION__: JSON.stringify(rootPkg.version),
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: {
    port: 7017,
    strictPort: true,
    host: true,
    allowedHosts: ["backy.dev.hexly.ai"],
    proxy: {
      "/api": "http://127.0.0.1:7018",
    },
  },
  build: {
    outDir: "../worker/static",
    emptyOutDir: true,
    sourcemap: true,
  },
});
