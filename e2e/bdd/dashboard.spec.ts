import { test, expect } from "./fixtures";

test.describe("Dashboard Page", () => {
  test("displays dashboard with stats", async ({ page }) => {
    await page.goto("/");

    await expect(page).toHaveTitle(/backy/i);
    await expect(page.locator("text=Dashboard").first()).toBeVisible();
  });

  test("shows navigation sidebar", async ({ page }) => {
    await page.goto("/");

    await expect(page.locator("nav").first()).toBeVisible();
    await expect(page.locator("text=Projects")).toBeVisible();
    await expect(page.locator("text=Backups")).toBeVisible();
  });
});
