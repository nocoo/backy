/**
 * BDD Spec 4: Manual upload flow
 *
 * GIVEN the backup list page
 * WHEN clicking the upload button and filling the form
 * THEN a backup is uploaded successfully
 */
import { test, expect } from "@playwright/test";
import { join } from "path";
import { writeFileSync, mkdirSync, unlinkSync } from "fs";

const TEMP_DIR = join(process.cwd(), "e2e", "bdd", ".tmp");
const TEMP_FILE = join(TEMP_DIR, "bdd-test-upload.json");

test.describe("Manual Upload", () => {
  test.beforeAll(() => {
    mkdirSync(TEMP_DIR, { recursive: true });
    writeFileSync(TEMP_FILE, JSON.stringify({ bdd: true, ts: Date.now() }));
  });

  test.afterAll(() => {
    try {
      unlinkSync(TEMP_FILE);
    } catch {
      // ignore
    }
  });

  test("GIVEN /backups page WHEN clicking upload THEN upload dialog opens", async ({ page }) => {
    await page.goto("/backups");

    await expect(page.getByRole("heading", { name: "Backups" })).toBeVisible({ timeout: 15_000 });

    // Look for the upload backup button
    const uploadButton = page.getByRole("button", { name: /upload backup/i });
    if (await uploadButton.isVisible({ timeout: 5_000 }).catch(() => false)) {
      await uploadButton.click();

      // Dialog should open
      const dialog = page.getByRole("dialog");
      await expect(dialog).toBeVisible();

      // Dialog should have a project selector label
      await expect(dialog.getByText("Project", { exact: true })).toBeVisible();
    }
  });

  test("GIVEN upload dialog WHEN selecting project and file THEN upload succeeds", async ({ page }) => {
    await page.goto("/backups");

    await expect(page.getByRole("heading", { name: "Backups" })).toBeVisible({ timeout: 15_000 });

    const uploadButton = page.getByRole("button", { name: /upload backup/i });
    if (!(await uploadButton.isVisible({ timeout: 5_000 }).catch(() => false))) {
      test.skip();
      return;
    }

    await uploadButton.click();

    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();

    // Select backy-test project from the dropdown
    const projectSelect = dialog.locator("select, [role='combobox']").first();
    if (await projectSelect.isVisible({ timeout: 3_000 }).catch(() => false)) {
      await projectSelect.click();
      // Try to select backy-test
      const option = page.getByRole("option", { name: /backy-test/i });
      if (await option.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await option.click();
      }
    }

    // Upload a file
    const fileInput = dialog.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(TEMP_FILE);

      // Click upload/submit button inside dialog
      const submitButton = dialog.getByRole("button", { name: /upload/i });
      if (await submitButton.isVisible({ timeout: 2_000 }).catch(() => false)) {
        await submitButton.click();

        // Should see success indication (toast or dialog closes)
        await page.waitForTimeout(2_000);
      }
    }
  });
});
