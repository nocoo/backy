/**
 * BDD Spec 1: Dashboard loads with stats and charts
 *
 * GIVEN an authenticated user (auth bypassed)
 * WHEN navigating to the dashboard
 * THEN stat cards, charts, and recent backups are visible
 */
import { test, expect } from "@playwright/test";

test.describe("Dashboard", () => {
  test("GIVEN auth bypass WHEN visiting / THEN dashboard renders with stat cards", async ({ page }) => {
    await page.goto("/");

    // Dashboard should show stat cards
    await expect(page.getByText("Total Projects")).toBeVisible({ timeout: 15_000 });
    await expect(page.getByText("Total Backups")).toBeVisible();
    await expect(page.getByText("Storage Used")).toBeVisible();
  });

  test("GIVEN dashboard loaded WHEN inspecting charts section THEN charts are visible", async ({ page }) => {
    await page.goto("/");

    // Wait for charts to render (they load async)
    await expect(page.getByText("Total Projects")).toBeVisible({ timeout: 15_000 });

    // Charts section should exist
    await expect(page.getByText("Backups by Project")).toBeVisible();
    await expect(page.getByText("Backup Activity", { exact: true })).toBeVisible();
  });

  test("GIVEN dashboard loaded WHEN inspecting recent backups THEN section is visible", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Total Projects")).toBeVisible({ timeout: 15_000 });

    // Recent backups section
    await expect(page.getByText("Recent Backups")).toBeVisible();
  });
});
