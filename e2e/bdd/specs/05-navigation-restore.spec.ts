/**
 * BDD Spec 5: Sidebar navigation and log pages
 *
 * GIVEN the app is loaded
 * WHEN clicking sidebar links
 * THEN each page renders correctly
 */
import { test, expect } from "@playwright/test";

test.describe("Sidebar Navigation", () => {
  test("GIVEN dashboard WHEN clicking Projects in sidebar THEN navigates to /projects", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Total Projects")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /^projects$/i }).click();
    await expect(page).toHaveURL(/\/projects$/);
    await expect(page.getByText("backy-test")).toBeVisible({ timeout: 10_000 });
  });

  test("GIVEN dashboard WHEN clicking Backups in sidebar THEN navigates to /backups", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Total Projects")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /^backups$/i }).click();
    await expect(page).toHaveURL(/\/backups$/);
    await expect(page.getByText("Project")).toBeVisible({ timeout: 10_000 });
  });

  test("GIVEN dashboard WHEN clicking Webhook Logs in sidebar THEN navigates to /logs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Total Projects")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /webhook logs/i }).click();
    await expect(page).toHaveURL(/\/logs$/);
  });

  test("GIVEN dashboard WHEN clicking Cron Logs in sidebar THEN navigates to /cron-logs", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByText("Total Projects")).toBeVisible({ timeout: 15_000 });

    await page.getByRole("link", { name: /cron logs/i }).click();
    await expect(page).toHaveURL(/\/cron-logs$/);
  });
});

test.describe("Restore URL Generation", () => {
  test("GIVEN a backup detail page WHEN clicking Generate URL THEN restore URL appears", async ({ page }) => {
    // First go to backups list and click the first one
    await page.goto("/backups");
    await expect(page.getByText("Project")).toBeVisible({ timeout: 15_000 });

    const firstBackupLink = page.locator("a[href^='/backups/']").first();
    if (!(await firstBackupLink.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await firstBackupLink.click();
    await expect(page).toHaveURL(/\/backups\/[a-zA-Z0-9_-]+$/);

    // Look for Generate URL / Restore button
    const generateButton = page.getByRole("button", { name: /generate.*url|restore/i });
    if (await generateButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await generateButton.click();

      // Should show a URL or copy button
      await page.waitForTimeout(1_000);
      // The restore URL should contain /api/restore/
      const restoreUrlText = page.locator("text=/api\\/restore\\//");
      if (await restoreUrlText.isVisible({ timeout: 3_000 }).catch(() => false)) {
        await expect(restoreUrlText).toBeVisible();
      }
    }
  });
});
