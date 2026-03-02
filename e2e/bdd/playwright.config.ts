import { defineConfig } from "@playwright/test";

const BDD_PORT = 27026;

export default defineConfig({
  testDir: "./specs",
  timeout: 30_000,
  retries: 0,
  workers: 1, // serial — tests share server state
  fullyParallel: false,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${BDD_PORT}`,
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { browserName: "chromium" },
    },
  ],
  // Server is managed by runner.ts — do NOT use webServer here
});
