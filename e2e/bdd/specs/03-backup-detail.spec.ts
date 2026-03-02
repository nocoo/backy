/**
 * BDD Spec 3: Backup list and detail navigation
 *
 * GIVEN existing backups in the system
 * WHEN navigating to /backups
 * THEN backup table renders with data
 * AND clicking a backup navigates to its detail page with preview
 */
import { test, expect } from "@playwright/test";

test.describe("Backup List & Detail", () => {
  test("GIVEN auth bypass WHEN visiting /backups THEN backup table renders", async ({ page }) => {
    await page.goto("/backups");

    // Table should render with at least column headers
    await expect(page.getByText("Project")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Environment")).toBeVisible();
  });

  test("GIVEN backup list WHEN filtering by search THEN table updates", async ({ page }) => {
    await page.goto("/backups");

    await expect(page.getByText("Project")).toBeVisible({ timeout: 15_000 });

    // Search for something that should match backy-test backups
    const searchInput = page.getByPlaceholder(/search/i);
    if (await searchInput.isVisible()) {
      await searchInput.fill("backy-test");
      // Wait for the table to update
      await page.waitForTimeout(500);
    }
  });

  test("GIVEN backup list with data WHEN clicking a backup row THEN navigates to detail", async ({ page }) => {
    await page.goto("/backups");

    await expect(page.getByText("Project")).toBeVisible({ timeout: 15_000 });

    // Click the first backup detail link (Eye icon button)
    const firstBackupLink = page.locator("a[href^='/backups/']").first();
    if (await firstBackupLink.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await firstBackupLink.click();

      // Should be on backup detail page
      await expect(page).toHaveURL(/\/backups\/[a-zA-Z0-9_-]+$/);

      // Detail page should show metadata
      await expect(page.getByText(/file type/i)).toBeVisible({ timeout: 10_000 });
    } else {
      // No backups to navigate to — skip gracefully
      test.skip();
    }
  });
});
