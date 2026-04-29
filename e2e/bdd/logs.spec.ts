import { test, expect } from "./fixtures";

test.describe("Logs Pages", () => {
  test("GET /logs displays webhook logs", async ({ page }) => {
    await page.goto("/logs");

    await expect(page.locator("text=Webhook Logs").first()).toBeVisible();
  });

  test("GET /cron-logs displays cron logs", async ({ page }) => {
    await page.goto("/cron-logs");

    await expect(page.locator("text=Cron Logs").first()).toBeVisible();
  });
});
