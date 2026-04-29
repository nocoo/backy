import { test, expect } from "./fixtures";

test.describe("Backups Pages", () => {
  test("GET /backups displays backups list", async ({ page }) => {
    await page.goto("/backups");

    await expect(page.locator("text=Backups").first()).toBeVisible();
  });

  test("GET /backups/:id displays backup detail", async ({
    page,
    testBackupId,
  }) => {
    await page.goto(`/backups/${testBackupId}`);

    // Verify it's the real detail page, not the 404 error page
    await expect(page.locator("text=Backup not found")).not.toBeVisible();
    await expect(page.getByRole("button", { name: "Download" })).toBeVisible();
  });
});
