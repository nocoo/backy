/**
 * Suite: Project CRUD Lifecycle — create, list, get, update, IP whitelist, validation
 */

import { test, assert, assertEqual } from "../framework";
import { state } from "../config";

export async function suiteProjectCrud(): Promise<void> {
  console.log("\n📋 Suite: Project CRUD Lifecycle");

  let projectId = "";
  let projectToken = "";

  // Step 1: Create project
  await test("GIVEN valid project data WHEN creating via POST THEN returns 201 with project object", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Test Project", description: "Created by E2E tests" }),
    });
    assertEqual(res.status, 201, "status");
    const body = await res.json();
    assert(typeof body.id === "string" && body.id.length > 0, "id should be a non-empty string");
    assertEqual(body.name, "E2E Test Project", "name");
    assertEqual(body.description, "Created by E2E tests", "description");
    assert(typeof body.webhook_token === "string" && body.webhook_token.length > 0, "webhook_token should exist in POST response");
    projectId = body.id;
    projectToken = body.webhook_token;
    state.createdProjectIds.push(projectId);
    state.createdProjectTokens.push(projectToken);
  });

  // Step 2: List projects
  await test("GIVEN a created project WHEN listing all projects THEN the new project appears", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(Array.isArray(body), "response should be an array");
    const found = body.find((p: { id: string }) => p.id === projectId);
    assert(found !== undefined, "project should appear in list");
    assertEqual(found.name, "E2E Test Project", "name");
  });

  // Step 3: Get project by ID
  await test("GIVEN a created project WHEN getting by ID THEN returns sanitized project data (no webhook_token)", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.id, projectId, "id");
    assertEqual(body.name, "E2E Test Project", "name");
    assertEqual(body.description, "Created by E2E tests", "description");
    assert(body.webhook_token === undefined, "webhook_token should NOT be present in GET response (sanitized)");
    assertEqual(body.allowed_ips, null, "allowed_ips should be null by default");
    assertEqual(body.category_id, null, "category_id should be null by default");
  });

  // Step 4: Update project name + description
  await test("GIVEN a created project WHEN updating name and description THEN returns updated data", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "E2E Updated Project", description: "Updated description" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated Project", "name");
    assertEqual(body.description, "Updated description", "description");
  });

  // Step 5: Verify update persisted
  await test("GIVEN an updated project WHEN getting by ID THEN returns updated values", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`);
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.name, "E2E Updated Project", "name");
    assertEqual(body.description, "Updated description", "description");
  });

  // Step 6: Set allowed_ips with valid CIDR
  await test("GIVEN a project WHEN setting allowed_ips with valid CIDR THEN succeeds", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_ips: "192.168.1.0/24, 10.0.0.1/32" }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assert(body.allowed_ips !== null, "allowed_ips should be set");
    assert(body.allowed_ips.includes("192.168.1.0"), "should contain first CIDR");
    assert(body.allowed_ips.includes("10.0.0.1"), "should contain second CIDR");
  });

  // Step 7: Set allowed_ips with invalid format
  await test("GIVEN a project WHEN setting allowed_ips with invalid format THEN returns 400", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_ips: "not-a-valid-cidr" }),
    });
    assertEqual(res.status, 400, "status");
    const body = await res.json();
    assert(body.error.toLowerCase().includes("ip") || body.error.toLowerCase().includes("cidr"), "error should mention IP/CIDR");
  });

  // Step 8: Clear allowed_ips
  await test("GIVEN a project with allowed_ips WHEN clearing with null THEN succeeds", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/${projectId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ allowed_ips: null }),
    });
    assertEqual(res.status, 200, "status");
    const body = await res.json();
    assertEqual(body.allowed_ips, null, "allowed_ips should be null");
  });

  // Step 9: Get nonexistent project
  await test("GIVEN a nonexistent project ID WHEN getting THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/nonexistent-project-id-xyz`);
    assertEqual(res.status, 404, "status");
  });

  // Step 10: Create project with invalid data (empty name)
  await test("GIVEN invalid project data WHEN creating THEN returns 400", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "" }),
    });
    assertEqual(res.status, 400, "status");
  });

  // Step 11: Update nonexistent project
  await test("GIVEN a nonexistent project ID WHEN updating THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/nonexistent-project-id-xyz`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ghost" }),
    });
    assertEqual(res.status, 404, "status");
  });

  // Step 12: Delete nonexistent project
  await test("GIVEN a nonexistent project ID WHEN deleting THEN returns 404", async () => {
    const res = await fetch(`${state.baseUrl}/api/projects/nonexistent-project-id-xyz`, {
      method: "DELETE",
    });
    assertEqual(res.status, 404, "status");
  });
}
