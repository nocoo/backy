/**
 * Suite: Token Regeneration — regenerate webhook token, verify old/new
 */

import { test, assert, assertEqual } from "../framework";
import { state } from "../config";

export async function suiteTokenRegeneration(): Promise<void> {
  console.log("\n📋 Suite: Token Regeneration");

  // This suite uses the project created by suiteProjectCrud
  assert(state.createdProjectIds.length > 0, "suiteProjectCrud must run first");
  const projectId = state.createdProjectIds[0]!;

  // Step 1: Get current token
  let oldToken = "";
  await test("GIVEN a project WHEN getting it THEN has a webhook_token", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.webhook_token === "string" && body.webhook_token.length > 0, "webhook_token should exist");
    oldToken = body.webhook_token;
  });

  // Step 2: Regenerate token
  let newToken = "";
  await test("GIVEN a project WHEN regenerating token THEN returns new token different from old", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}/token`, { method: "POST" });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(typeof body.webhook_token === "string" && body.webhook_token.length > 0, "new webhook_token should exist");
    assert(body.webhook_token !== oldToken, "new token should differ from old token");
    newToken = body.webhook_token;
  });

  // Step 3: Verify old token fails on HEAD
  await test("GIVEN a regenerated token WHEN using old token on HEAD THEN returns 403", async () => {
    const res = await fetch(`${state.baseUrl}/api/webhook/${projectId}`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${oldToken}` },
    });
    assertEqual(res.status, 403, "status");
  });

  // Step 4: Verify new token works on HEAD
  await test("GIVEN a regenerated token WHEN using new token on HEAD THEN returns 200", async () => {
    const res = await fetch(`${state.baseUrl}/api/webhook/${projectId}`, {
      method: "HEAD",
      headers: { Authorization: `Bearer ${newToken}` },
    });
    assertEqual(res.status, 200, "status");
  });

  // Step 5: Regenerate token for nonexistent project
  await test("GIVEN a nonexistent project WHEN regenerating token THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/nonexistent-project-id-xyz/token`, { method: "POST" });
    assertEqual(res.status, 404, "status");
  });
}
