/**
 * Suite: Prompt Generation — /api/projects/:id/prompt
 */

import { test, assert, assertEqual } from "../framework";
import { state, PROJECT_ID, WEBHOOK_TOKEN } from "../config";

export async function suitePromptGeneration(): Promise<void> {
  console.log("\n📋 Suite: Prompt Generation");

  await test("GIVEN a valid project WHEN requesting prompt THEN returns 200 with prompt text", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}/prompt`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.prompt === "string" && body.prompt.length > 0, "prompt should be a non-empty string");
    // Verify prompt contains key elements
    assert(body.prompt.includes("backy-test"), "prompt should contain project name");
    assert(body.prompt.includes(PROJECT_ID), "prompt should contain project ID");
    assert(body.prompt.includes(WEBHOOK_TOKEN), "prompt should contain webhook token");
  });

  await test("GIVEN a valid project WHEN inspecting prompt THEN contains all 4 sections", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${PROJECT_ID}/prompt`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.prompt.includes("Verify API Key"), "prompt should have Verify section");
    assert(body.prompt.includes("Query Backup Status"), "prompt should have Query section");
    assert(body.prompt.includes("Send a Backup"), "prompt should have Send section");
    assert(body.prompt.includes("Restore a Backup"), "prompt should have Restore section");
  });

  await test("GIVEN a nonexistent project WHEN requesting prompt THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/nonexistent-project-id-xyz/prompt`);
    assertEqual(res.status, 404, "status");
  });
}
