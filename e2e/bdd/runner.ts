/**
 * BDD E2E runner — starts a dedicated dev server with E2E_SKIP_AUTH=true
 * on port 27026, runs Playwright BDD specs, and exits.
 *
 * Startup sequence:
 * 1. Kill any orphan process on BDD_PORT
 * 2. Clean stale .next/dev/lock
 * 3. Start dev server with auth bypass on BDD_PORT
 * 4. Wait for server readiness
 * 5. Run Playwright tests
 * 6. Shut down server
 */

import { execSync, spawn } from "child_process";
import { unlinkSync } from "fs";
import { join } from "path";

const BDD_PORT = 27026;
const STARTUP_TIMEOUT = 60_000;

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

function killOrphanOnPort(port: number): void {
  try {
    const pids = execSync(`lsof -ti:${port}`, { encoding: "utf-8" }).trim();
    if (pids) {
      execSync(`kill -9 ${pids.split("\n").join(" ")}`);
      console.log(`🔪 Killed orphan process(es) on port ${port}: ${pids.replace(/\n/g, ", ")}`);
    }
  } catch {
    // No process on port — expected
  }
}

function cleanLockFile(): void {
  const lockPath = join(process.cwd(), ".next", "dev", "lock");
  try {
    unlinkSync(lockPath);
    console.log("🧹 Removed stale .next/dev/lock");
  } catch {
    // File doesn't exist — fine
  }
}

async function main() {
  const baseUrl = `http://localhost:${BDD_PORT}`;

  killOrphanOnPort(BDD_PORT);
  cleanLockFile();

  console.log("🚀 Starting BDD E2E server on port", BDD_PORT);

  const server = spawn("bun", ["next", "dev", "--port", String(BDD_PORT)], {
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
    console.error("\n❌ BDD server failed to start:", error);
    if (serverOutput) {
      console.error("\nServer output:\n", serverOutput.slice(-2000));
    }
    server.kill("SIGTERM");
    process.exitCode = 1;
    return;
  }

  try {
    const configPath = join(import.meta.dir, "playwright.config.ts");
    execSync(`bunx playwright test --config "${configPath}"`, {
      encoding: "utf-8",
      stdio: "inherit",
      env: { ...process.env, BASE_URL: baseUrl },
    });
  } catch {
    // Playwright exits with code 1 on test failure — captured by execSync throw
    process.exitCode = 1;
  } finally {
    console.log("\n🧹 Shutting down BDD test server...");
    server.kill("SIGTERM");
    setTimeout(() => server?.kill("SIGKILL"), 5000);
  }
}

main();
