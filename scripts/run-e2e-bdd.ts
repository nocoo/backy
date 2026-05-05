/**
 * L3: BDD E2E test runner with full server lifecycle.
 *
 * Steps:
 *   1. Build web app (outputs to apps/worker/static/)
 *   2. Clean persist dir + spawn `wrangler dev --local --persist-to` on port 17018
 *   3. Wait for server ready (poll /api/live)
 *   4. Initialize D1 schema (POST /api/db/init)
 *   5. Verify _test_marker (refuse to run against prod D1)
 *   6. Run Playwright tests
 *   7. Kill server
 *   8. Exit with test exit code
 *
 * All CF bindings are simulated locally via miniflare (SQLite-backed D1/R2).
 * No remote CF credentials required.
 *
 * Usage:
 *   bun run scripts/run-e2e-bdd.ts
 */

import { resolve } from "node:path";
import { rmSync } from "node:fs";
import type { Subprocess } from "bun";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_DIR = resolve(ROOT, "apps/worker");
const WEB_DIR = resolve(ROOT, "apps/web");
const E2E_PORT = 17018;
const PERSIST_DIR = resolve(WORKER_DIR, ".wrangler/e2e-bdd");
const POLL_INTERVAL_MS = 500;
const MAX_WAIT_MS = 60_000;

// ---------------------------------------------------------------------------
// Step 1: Build web app
// ---------------------------------------------------------------------------

async function buildWebApp(): Promise<void> {
  console.log("\nStep 1: Building web app...");
  const start = Date.now();

  const proc = Bun.spawn(["bun", "run", "build"], {
    cwd: WEB_DIR,
    stdout: "inherit",
    stderr: "inherit",
  });

  const exitCode = await proc.exited;
  if (exitCode !== 0) {
    console.error("FATAL: Web app build failed");
    process.exit(1);
  }
  console.log(`  Build complete (${Date.now() - start}ms)`);
}

// ---------------------------------------------------------------------------
// Step 2: Check port availability, clean persist dir, and spawn dev server
// ---------------------------------------------------------------------------

async function checkPortFree(): Promise<void> {
  try {
    const res = await fetch(`http://localhost:${E2E_PORT}/api/live`, {
      signal: AbortSignal.timeout(1000),
    });
    if (res.ok) {
      console.error(
        `FATAL: Port ${E2E_PORT} is already in use. Kill the existing server first.`,
      );
      process.exit(1);
    }
  } catch {
    // Expected — port is free
  }
}

function cleanPersistDir(): void {
  rmSync(PERSIST_DIR, { recursive: true, force: true });
  console.log(`  Cleaned persist dir: ${PERSIST_DIR}`);
}

function spawnDevServer(): Subprocess {
  console.log(`\nStep 2: Starting wrangler dev --local on port ${E2E_PORT}...`);
  cleanPersistDir();

  const proc = Bun.spawn(
    [
      "npx",
      "wrangler",
      "dev",
      "--local",
      "--port",
      String(E2E_PORT),
      `--persist-to=${PERSIST_DIR}`,
      "--var=ENVIRONMENT:test",
      "--var=E2E_SKIP_AUTH:true",
    ],
    {
      cwd: WORKER_DIR,
      env: {
        ...process.env,
        WRANGLER_LOG: "error",
        NODE_ENV: "test",
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  return proc;
}

// ---------------------------------------------------------------------------
// Step 3: Wait for server ready
// ---------------------------------------------------------------------------

async function waitForServer(server: Subprocess): Promise<void> {
  const url = `http://localhost:${E2E_PORT}/api/live`;
  const start = Date.now();

  console.log(`\nStep 3: Waiting for server at ${url}...`);

  // Track early exit
  let serverExited = false;
  void server.exited.then(() => { serverExited = true; });

  while (Date.now() - start < MAX_WAIT_MS) {
    if (serverExited) {
      console.error("FATAL: wrangler dev exited before becoming ready (port conflict?)");
      process.exit(1);
    }
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
// Step 4: Initialize D1 schema
// ---------------------------------------------------------------------------

async function initSchema(): Promise<void> {
  console.log("\nStep 4: Initializing D1 schema...");
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
// Step 5: Verify test marker
// ---------------------------------------------------------------------------

async function verifyTestMarker(): Promise<void> {
  console.log("\nStep 5: Verifying _test_marker (refuse to run against prod D1)...");
  try {
    const res = await fetch(`http://localhost:${E2E_PORT}/api/db/init/marker`, {
      signal: AbortSignal.timeout(10_000),
    });
    const body = (await res.json()) as { marker?: string | null };
    if (body.marker !== "e2e-test-db") {
      console.error(`FATAL: _test_marker missing or wrong (got ${JSON.stringify(body.marker)}).`);
      process.exit(1);
    }
    console.log("  _test_marker = e2e-test-db ✓");
  } catch (err) {
    console.error(`FATAL: _test_marker check failed: ${err}`);
    process.exit(1);
  }
}

// ---------------------------------------------------------------------------
// Step 6: Run Playwright tests
// ---------------------------------------------------------------------------

async function runPlaywright(): Promise<number> {
  console.log("\nStep 6: Running Playwright BDD tests...\n");

  const proc = Bun.spawn(
    [
      "npx",
      "playwright",
      "test",
      "--config",
      "e2e/bdd/playwright.config.ts",
    ],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        BASE_URL: `http://localhost:${E2E_PORT}`,
      },
      stdout: "inherit",
      stderr: "inherit",
    },
  );

  return proc.exited;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log("=== L3: BDD E2E Test Runner ===\n");

  // Step 1: Build web app
  await buildWebApp();

  // Step 2: Check port free, clean persist dir, then spawn dev server
  await checkPortFree();
  const server = spawnDevServer();

  let testExitCode = 1;

  try {
    // Step 3: Wait for ready
    await waitForServer(server);

    // Step 4: Initialize D1 schema
    await initSchema();

    // Step 5: Verify test marker
    await verifyTestMarker();

    // Step 6: Run Playwright
    testExitCode = await runPlaywright();
  } finally {
    // Step 7: Kill server
    console.log("\nStep 7: Stopping dev server...");
    server.kill();
    await server.exited;
    console.log("  Server stopped.");
  }

  // Step 8: Exit
  if (testExitCode !== 0) {
    console.error("\n=== BDD E2E tests FAILED ===\n");
    process.exit(1);
  }

  console.log("\n=== BDD E2E tests PASSED ===\n");
}

void main();
