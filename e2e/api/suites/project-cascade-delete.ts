/**
 * Suite: Project Cascade Delete — delete project cascades to backups
 */

import { test, assert, assertEqual } from "../framework";
import { state } from "../config";

export async function suiteProjectCascadeDelete(): Promise<void> {
  console.log("\n📋 Suite: Project Cascade Delete");

  // Uses the project created by suiteProjectCrud (createdProjectIds[0])
  assert(state.createdProjectIds.length > 0, "suiteProjectCrud must run first");
  assert(state.createdProjectTokens.length > 0, "suiteProjectCrud must store token");
  const projectId = state.createdProjectIds[0]!;
  const projectToken = state.createdProjectTokens[0]!;

  // Verify project exists (sanitized response)
  await test("GIVEN a test project WHEN getting it THEN returns sanitized data (token stored separately)", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.webhook_token === undefined, "webhook_token should NOT be present in GET response");
    assertEqual(body.id, projectId, "id");
  });

  // Upload 2 backups to this project
  const cascadeBackupIds: string[] = [];
  await test("GIVEN a test project WHEN uploading 2 backups THEN both succeed", async () => {
    for (let i = 0; i < 2; i++) {
      const formData = new FormData();
      const jsonBlob = new Blob([JSON.stringify({ cascade_test: i })], { type: "application/json" });
      formData.append("file", new File([jsonBlob], `cascade-${i}.json`, { type: "application/json" }));
      formData.append("environment", "test");
      formData.append("tag", `e2e-test-cascade-${i}`);

      const res = await fetch(`${state.baseUrl}/api/webhook/${projectId}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${projectToken}` },
        body: formData,
      });
      assertEqual(res.status, 201, `upload ${i} status`);
      const body = await res.json();
      cascadeBackupIds.push(body.id);
    }
    assertEqual(cascadeBackupIds.length, 2, "should have 2 backup IDs");
  });

  // Verify backups exist
  await test("GIVEN uploaded backups WHEN querying THEN both exist", async () => {
    for (const id of cascadeBackupIds) {
      const res = await fetch(`${state.baseUrl}/api/backups/${id}`);
      assertEqual(res.status, 200, `backup ${id} should exist`);
    }
  });

  // Delete the project
  await test("GIVEN a project with backups WHEN deleting the project THEN returns success", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`, { method: "DELETE" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.success, true, "success");
    // Remove from cleanup list
    const idx = state.createdProjectIds.indexOf(projectId);
    if (idx !== -1) state.createdProjectIds.splice(idx, 1);
  });

  // Verify project is gone
  await test("GIVEN a deleted project WHEN getting by ID THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 404, "status");
  });

  // Verify backups are gone (CASCADE DELETE)
  await test("GIVEN a deleted project WHEN querying its backups THEN all return 404", async () => {
    for (const id of cascadeBackupIds) {
      const res = await fetch(`${state.baseUrl}/api/backups/${id}`);
      assertEqual(res.status, 404, `backup ${id} should be 404 after project delete`);
    }
  });
}
