/**
 * BDD Spec 2: Project list and creation flow
 *
 * GIVEN an authenticated user
 * WHEN navigating to /projects
 * THEN project list renders with backy-test visible
 * AND the user can create a new project and navigate to it
 */
import { test, expect } from "@playwright/test";

test.describe("Projects", () => {
  test("GIVEN auth bypass WHEN visiting /projects THEN project list renders", async ({ page }) => {
    await page.goto("/projects");

    // Should show the projects page with the existing backy-test project
    await expect(page.getByText("backy-test")).toBeVisible({ timeout: 15_000 });
  });

  test("GIVEN project list WHEN clicking New Project THEN navigates to creation form", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.getByText("backy-test")).toBeVisible({ timeout: 15_000 });

    // Click new project button (it's a <Button> not <Link>)
    await page.getByRole("button", { name: /new project/i }).click();

    // Should be on the new project page
    await expect(page).toHaveURL(/\/projects\/new/);
    await expect(page.getByLabel(/name/i)).toBeVisible();
  });

  test("GIVEN new project form WHEN filling and submitting THEN redirects to project detail", async ({ page }) => {
    await page.goto("/projects/new");

    const projectName = `bdd-test-${Date.now()}`;

    // Fill in the name
    await page.getByLabel(/name/i).fill(projectName);

    // Submit
    await page.getByRole("button", { name: /create/i }).click();

    // Should redirect to the new project's detail page
    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9_-]+$/, { timeout: 10_000 });
    await expect(page.getByText(projectName)).toBeVisible();

    // Clean up: delete the project via the danger zone
    await page.getByRole("button", { name: /delete project/i }).click();
    // Confirm in dialog
    const dialog = page.getByRole("dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /delete/i }).click();

    // Should redirect back to projects list
    await expect(page).toHaveURL(/\/projects$/, { timeout: 10_000 });
  });

  test("GIVEN a project detail page WHEN inspecting sections THEN shows webhook integration and settings", async ({ page }) => {
    // Navigate to the backy-test project
    await page.goto("/projects");
    await expect(page.getByText("backy-test")).toBeVisible({ timeout: 15_000 });
    await page.getByText("backy-test").click();

    // Should be on project detail
    await expect(page).toHaveURL(/\/projects\/[a-zA-Z0-9_-]+$/);

    // Key sections should be visible
    await expect(page.getByText("Webhook Integration", { exact: true })).toBeVisible();
    await expect(page.getByText("General", { exact: true })).toBeVisible();
  });
});
