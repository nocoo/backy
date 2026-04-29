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

  // Create an independent project + backup to avoid race conditions with
  // seed-test-project (which cleans up all backups for the shared project).
  testBackupId: async ({ request }, use) => {
    // Create a dedicated project for this test's backup
    const projRes = await request.post(`${BASE_URL}/api/projects`, {
      data: { name: `BDD Backup Test ${Date.now()}` },
    });
    if (!projRes.ok()) {
      throw new Error(`Failed to create backup project: ${projRes.status()}`);
    }
    const proj = await projRes.json();
    const projectId = proj.id;

    // Upload a backup to this isolated project
    const res = await request.post(`${BASE_URL}/api/backups/upload`, {
      multipart: {
        projectId,
        environment: "test",
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

    // Cleanup: delete backup and project
    await request.delete(`${BASE_URL}/api/backups/${body.id}`, {
      data: {},
    });
    await request.delete(`${BASE_URL}/api/projects/${projectId}`, {
      data: {},
    });
  },
});

export { expect } from "@playwright/test";
