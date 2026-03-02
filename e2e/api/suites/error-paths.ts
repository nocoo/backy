/**
 * Suite: Error Paths — auth errors, empty file, invalid environment, 404s
 */

import { test, assert, assertEqual } from "../framework";
import { state, WEBHOOK_TOKEN } from "../config";
import { webhookUrl } from "../helpers";

export async function suiteErrorPaths(): Promise<void> {
  console.log("\n📋 Suite: Error Paths");

  // HEAD — API key verification
  await test("GIVEN valid token WHEN sending HEAD to webhook THEN returns 200 with project name header", async () => {
    const res = await fetch(webhookUrl(), {
      method: "HEAD",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 200, "status");
    const projectName = res.headers.get("X-Project-Name");
    assert(projectName === "backy-test", `X-Project-Name should be backy-test, got ${projectName}`);
  });

  await test("GIVEN no Authorization header WHEN sending HEAD to webhook THEN returns 401", async () => {
    const res = await fetch(webhookUrl(), { method: "HEAD" });
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN sending HEAD to webhook THEN returns 403", async () => {
    const res = await fetch(webhookUrl(), {
      method: "HEAD",
      headers: { Authorization: "Bearer wrong-token-12345" },
    });
    assertEqual(res.status, 403, "status");
  });

  await test("GIVEN valid token but wrong project ID WHEN sending HEAD THEN returns 403", async () => {
    const res = await fetch(`${state.baseUrl}/api/webhook/wrong-project-id`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
    });
    assertEqual(res.status, 403, "status");
  });

  // Auth errors
  await test("GIVEN no Authorization header WHEN uploading THEN returns 401", async () => {
    const formData = new FormData();
    formData.append("file", new File(["test"], "backup.json", { type: "application/json" }));
    const res = await fetch(webhookUrl(), { method: "POST", body: formData });
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN uploading THEN returns 403", async () => {
    const formData = new FormData();
    formData.append("file", new File(["test"], "backup.json", { type: "application/json" }));
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: "Bearer wrong-token-12345" },
      body: formData,
    });
    assertEqual(res.status, 403, "status");
  });

  // Empty file
  await test("GIVEN an empty file WHEN uploading THEN returns 400", async () => {
    const formData = new FormData();
    formData.append("file", new File([], "empty.json", { type: "application/json" }));
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.includes("empty"), "error should mention empty");
  });

  // Missing file field
  await test("GIVEN no file field WHEN uploading THEN returns 400", async () => {
    const formData = new FormData();
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 400, "status");
  });

  // Invalid environment
  await test("GIVEN invalid environment value WHEN uploading THEN returns 400", async () => {
    const formData = new FormData();
    formData.append("file", new File(["{}"], "backup.json", { type: "application/json" }));
    formData.append("environment", "invalid-env");
    const res = await fetch(webhookUrl(), {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.toLowerCase().includes("environment"), "error should mention environment");
  });

  // 404 — non-existent backup
  await test("GIVEN a non-existent backup ID WHEN querying THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/nonexistent-id-12345`);
    assertEqual(res.status, 404, "status");
  });

  await test("GIVEN a non-existent backup ID WHEN requesting preview THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/nonexistent-id-12345/preview`);
    assertEqual(res.status, 404, "status");
  });

  await test("GIVEN a non-existent backup ID WHEN requesting download THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/backups/nonexistent-id-12345/download`);
    assertEqual(res.status, 404, "status");
  });

  // Restore error paths
  await test("GIVEN no token WHEN requesting restore THEN returns 401", async () => {
    const res = await fetch(`${state.baseUrl}/api/restore/some-id`);
    assertEqual(res.status, 401, "status");
  });

  await test("GIVEN wrong token WHEN requesting restore THEN returns 403", async () => {
    // Need a real backup ID first — use first created one
    if (state.createdBackupIds.length > 0) {
      const res = await fetch(`${state.baseUrl}/api/restore/${state.createdBackupIds[0]}?token=wrong-token`);
      assertEqual(res.status, 403, "status");
    }
  });

  await test("GIVEN non-existent backup WHEN requesting restore THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/restore/nonexistent-id?token=${WEBHOOK_TOKEN}`);
    assertEqual(res.status, 404, "status");
  });

  // Project ID mismatch
  await test("GIVEN valid token but wrong project ID WHEN uploading THEN returns 403", async () => {
    const formData = new FormData();
    formData.append("file", new File(["{}"], "backup.json", { type: "application/json" }));
    const res = await fetch(`${state.baseUrl}/api/webhook/wrong-project-id`, {
      method: "POST",
      headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
      body: formData,
    });
    assertEqual(res.status, 403, "status");
  });
}
