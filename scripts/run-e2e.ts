/**
 * E2E test runner — starts a dedicated dev server with E2E_SKIP_AUTH=true
 * on port 17026, runs all E2E tests, cleans up test data, and exits.
 *
 * Startup sequence:
 * 1. Kill any orphan process on E2E_PORT (from previous crashed runs)
 * 2. Clean stale .next/dev/lock to avoid Next.js lock conflicts
 * 3. Start fresh dev server with auth bypass on E2E_PORT
 * 4. Run all E2E suites, report results
 * 5. Shut down server (SIGTERM → SIGKILL fallback)
 */

import { execSync, spawn } from "child_process";
import { unlinkSync } from "fs";
import { join } from "path";
import { runE2ETests } from "../e2e/api/runner";

const E2E_PORT = 17026;
const STARTUP_TIMEOUT = 60_000; // 60s for Next.js to compile

async function isServerReady(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/api/live`);
    return res.ok;
  } catch {
    return false;
  }
}

async function waitForServer(url: string, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await isServerReady(url)) return;
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server failed to start within ${timeout / 1000}s`);
}

/** Kill any process listening on E2E_PORT (orphan from a previous crashed run). */
function killOrphanOnPort(port: number): void {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
    if (pids) {
      execSync(`kill -9 ${pids.split("\n").join(" ")}`);
      console.log(`🔪 Killed orphan process(es) on port ${port}: ${pids.replace(/\n/g, ", ")}`);
    }
  } catch {
    // No process on port — expected normal case
  }
}

function cleanLockFile(): void {
  const lockPath = join(process.cwd(), ".next", "dev", "lock");
  try {
    unlinkSync(lockPath);
    console.log("🧹 Removed stale .next/dev/lock");
  } catch {
    // File doesn't exist — that's fine
  }
}

async function main() {
  const baseUrl = `http://localhost:${E2E_PORT}`;

  // 1. Kill orphan processes on E2E port from previous crashed runs
  killOrphanOnPort(E2E_PORT);

  // 2. Clean stale lock file to prevent conflicts with dev server
  cleanLockFile();

  console.log("🚀 Starting E2E test server on port", E2E_PORT);

  const server = spawn("bun", ["next", "dev", "--port", String(E2E_PORT)], {
    env: { ...process.env, E2E_SKIP_AUTH: "true" },
    stdio: ["ignore", "pipe", "pipe"],
  });

  let serverOutput = "";
  server.stdout?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });
  server.stderr?.on("data", (chunk: Buffer) => {
    serverOutput += chunk.toString();
  });

  try {
    console.log("⏳ Waiting for server to be ready...");
    await waitForServer(baseUrl, STARTUP_TIMEOUT);
    console.log("✅ Server is ready\n");
  } catch (error) {
    console.error("\n❌ E2E server failed to start:", error);
    if (serverOutput) {
      console.error("\nServer output:\n", serverOutput.slice(-2000));
    }
    server.kill("SIGTERM");
    process.exitCode = 1;
    return;
  }

  try {
    const { passed, failed, total } = await runE2ETests(baseUrl);

    console.log("\n" + "=".repeat(60));
    console.log(`E2E Results: ${passed}/${total} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\n❌ E2E runner error:", error);
    process.exitCode = 1;
  } finally {
    console.log("\n🧹 Shutting down test server...");
    server.kill("SIGTERM");
    setTimeout(() => server?.kill("SIGKILL"), 5000);
  }
}

main();
