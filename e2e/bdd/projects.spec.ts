import { test, expect } from "./fixtures";

test.describe("Projects Pages", () => {
  test("GET /projects displays projects list", async ({ page }) => {
    await page.goto("/projects");

    await expect(page.locator("text=Projects").first()).toBeVisible();
  });

  test("GET /projects/new displays create project form", async ({ page }) => {
    await page.goto("/projects/new");

    await expect(page.locator("text=New Project").first()).toBeVisible();
    await expect(page.locator('input[name="name"]')).toBeVisible();
  });

  test("GET /projects/:id displays project detail", async ({
    page,
    testProjectId,
  }) => {
    await page.goto(`/projects/${testProjectId}`);

    await expect(page.locator("text=Project").first()).toBeVisible();
  });
});
