import { test as base } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:17018";

export interface TestFixtures {
  testProjectId: string;
  testBackupId: string;
}

export const test = base.extend<TestFixtures>({
  testProjectId: async ({ request }, use) => {
    const res = await request.post(`${BASE_URL}/api/db/seed-test-project`);
    if (!res.ok()) {
      throw new Error(`Failed to seed test project: ${res.status()}`);
    }
    const body = await res.json();
    await use(body.projectId);
  },

  testBackupId: async ({ request, testProjectId }, use) => {
    const formData = new FormData();
    formData.append("projectId", testProjectId);
    formData.append("environment", "bdd-test");
    formData.append(
      "file",
      new Blob(['{"bdd": "test"}'], { type: "application/json" }),
      "bdd-test.json"
    );

    const res = await request.post(`${BASE_URL}/api/backups/upload`, {
      multipart: {
        projectId: testProjectId,
        environment: "bdd-test",
        file: {
          name: "bdd-test.json",
          mimeType: "application/json",
          buffer: Buffer.from('{"bdd": "test"}'),
        },
      },
    });

    if (!res.ok()) {
      throw new Error(`Failed to create test backup: ${res.status()}`);
    }
    const body = await res.json();
    await use(body.id);
  },
});

export { expect } from "@playwright/test";
