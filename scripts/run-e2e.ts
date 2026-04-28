/**
 * L2: API E2E test runner with full server lifecycle.
 *
 * Steps:
 *   1. Spawn `wrangler dev --env test --port 17018` in apps/worker
 *   2. Wait for server ready (poll /api/live)
 *   3. Initialize D1 schema (POST /api/db/init)
 *   4. Verify _test_marker (refuse to run against prod D1)
 *   5. Run `bun test e2e/api/`
 *   6. Kill server
 *   7. Exit with test exit code
 *
 * Usage:
 *   bun run scripts/run-e2e.ts
 */

import { resolve } from "node:path";
import type { Subprocess } from "bun";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_DIR = resolve(ROOT, "apps/worker");
const E2E_PORT = 17018;
const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 60_000;

// ---------------------------------------------------------------------------
// Step 1: Spawn dev server
// ---------------------------------------------------------------------------

function spawnDevServer(): Subprocess {
  console.log(`\nStep 1: Starting wrangler dev --env test on port ${E2E_PORT}...`);

  const proc = Bun.spawn(
    [
      "npx",
      "wrangler",
      "dev",
      "--env",
      "test",
      "--port",
      String(E2E_PORT),
    ],
    {
      cwd: WORKER_DIR,
      env: {
        ...process.env,
        E2E_SKIP_AUTH: "true",
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  return proc;
}

// ---------------------------------------------------------------------------
// Step 2: Wait for server ready
// ---------------------------------------------------------------------------

async function waitForServer(): Promise<void> {
  const url = `http://localhost:${E2E_PORT}/api/live`;
  const start = Date.now();

  console.log(`\nStep 2: Waiting for server at ${url}...`);

  while (Date.now() - start < MAX_WAIT_MS) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (response.ok) {
        const body = (await response.json()) as {
          status: string;
          dependencies?: {
            d1?: { status: string };
            r2?: { status: string };
          };
        };
        const d1Up = body.dependencies?.d1?.status === "up";
        const r2Up = body.dependencies?.r2?.status === "up";
        if (body.status === "ok" && d1Up && r2Up) {
          console.log(`  Server ready (${Date.now() - start}ms)`);
          return;
        }
        console.log(`  Server responded but not ready: ${JSON.stringify(body)}`);
      }
    } catch {
      // Server not up yet
    }
    await Bun.sleep(POLL_INTERVAL_MS);
  }

  console.error(`FATAL: Server did not start within ${MAX_WAIT_MS}ms`);
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Step 3: Initialize D1 schema (idempotent)
// ---------------------------------------------------------------------------

async function initSchema(): Promise<void> {
  console.log("\nStep 3: Initializing D1 schema...");
  const start = Date.now();
  try {
    const res = await fetch(`http://localhost:${E2E_PORT}/api/db/init`, {
      method: "POST",
      signal: AbortSignal.timeout(30_000),
    });
    const body = (await res.json()) as { ok?: boolean; message?: string };
    if (res.ok && body.ok) {
      console.log(`  Schema initialized (${Date.now() - start}ms)`);
    } else {
      console.error(`  WARN: Schema init returned ${res.status}: ${JSON.stringify(body)}`);
    }
  } catch (err) {
    console.error(`  FATAL: Schema init failed (${Date.now() - start}ms): ${err}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 4: Verify the bound D1 is the test database (_test_marker row).
// ---------------------------------------------------------------------------

async function verifyTestMarker(): Promise<void> {
  console.log("\nStep 4: Verifying _test_marker (refuse to run against prod D1)...");
  try {
    const res = await fetch(`http://localhost:${E2E_PORT}/api/db/init/marker`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { marker?: string | null };
    if (body.marker !== "e2e-test-db") {
      console.error(`FATAL: _test_marker missing or wrong (got ${JSON.stringify(body.marker)}).`);
      console.error("  This D1 was NOT initialized as a test database.");
      console.error("  If this is unexpected, your worker may be bound to the production D1.");
      process.exit(1);
    }
    console.log("  _test_marker = e2e-test-db ✓");
  } catch (err) {
    console.error(`FATAL: _test_marker check failed: ${err}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 5: Run tests
// ---------------------------------------------------------------------------

async function runTests(): Promise<number> {
  console.log("\nStep 5: Running E2E tests...\n");

  const proc = Bun.spawn(["bun", "test", "--timeout", "15000", "e2e/api/"], {
    cwd: ROOT,
    stdout: "inherit",
    stderr: "inherit",
  });

  return proc.exited;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== L2: API E2E Test Runner ===\n");

  // Step 1: Spawn dev server
  const server = spawnDevServer();

  let testExitCode = 1;

  try {
    // Step 2: Wait for ready
    await waitForServer();

    // Step 3: Initialize D1 schema (idempotent, required for local D1)
    await initSchema();

    // Step 4: Refuse to run if the bound D1 is not the test database
    await verifyTestMarker();

    // Step 5: Run tests
    testExitCode = await runTests();
  } finally {
    // Step 6: Kill server
    console.log("\nStep 6: Stopping dev server...");
    server.kill();
    await server.exited;
    console.log("  Server stopped.");
  }

  // Step 7: Exit
  if (testExitCode !== 0) {
    console.error("\n=== E2E tests FAILED ===\n");
    process.exit(1);
  }

  console.log("\n=== E2E tests PASSED ===\n");
}

void main();
