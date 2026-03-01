/**
 * E2E test runner — starts a local dev server with E2E_SKIP_AUTH=true,
 * runs all E2E tests, cleans up test data, and exits.
 *
 * If a dev server is already running on port 7026, reuses it and skips
 * server lifecycle management entirely (avoids .next/dev/lock conflicts).
 */

import { spawn, type ChildProcess } from "child_process";
import { runE2ETests } from "./e2e-tests";

const E2E_PORT = 17026; // Dedicated E2E port
const DEV_PORT = 7026;  // Default dev server port
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

async function main() {
  let baseUrl: string;
  let server: ChildProcess | null = null;

  // Check if dev server is already running on port 7026
  const devRunning = await isServerReady(`http://localhost:${DEV_PORT}`);

  if (devRunning) {
    // Verify the running server has auth bypass enabled by hitting a protected route
    const authCheck = await fetch(`http://localhost:${DEV_PORT}/api/projects`).catch(() => null);
    const hasAuthBypass = authCheck?.ok && authCheck.headers.get("content-type")?.includes("json");

    if (hasAuthBypass) {
      console.log(`♻️  Dev server detected on port ${DEV_PORT} with auth bypass, reusing it`);
      baseUrl = `http://localhost:${DEV_PORT}`;
    } else {
      console.error(`❌ Dev server on port ${DEV_PORT} does not have E2E_SKIP_AUTH=true`);
      console.error(`   Restart it with: E2E_SKIP_AUTH=true bun dev`);
      console.error(`   Or stop it so E2E can start its own server.`);
      process.exitCode = 1;
      return;
    }
  } else {
    console.log("🚀 Starting E2E test server on port", E2E_PORT);
    baseUrl = `http://localhost:${E2E_PORT}`;

    server = spawn("bun", ["next", "dev", "--port", String(E2E_PORT)], {
      env: { ...process.env, E2E_SKIP_AUTH: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });

    // Capture server output for debugging
    let serverOutput = "";
    server.stdout?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });
    server.stderr?.on("data", (chunk: Buffer) => {
      serverOutput += chunk.toString();
    });

    // Attach output for error reporting
    (server as ChildProcess & { __output?: string }).__output = "";
    const origStdout = server.stdout;
    const origStderr = server.stderr;
    origStdout?.on("data", (chunk: Buffer) => {
      (server as ChildProcess & { __output: string }).__output += chunk.toString();
    });
    origStderr?.on("data", (chunk: Buffer) => {
      (server as ChildProcess & { __output: string }).__output += chunk.toString();
    });

    try {
      console.log("⏳ Waiting for server to be ready...");
      await waitForServer(baseUrl, STARTUP_TIMEOUT);
      console.log("✅ Server is ready\n");
    } catch (error) {
      console.error("\n❌ E2E runner error:", error);
      if (serverOutput) {
        console.error("\nServer output:\n", serverOutput.slice(-2000));
      }
      server.kill("SIGTERM");
      process.exitCode = 1;
      return;
    }
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
    if (server) {
      console.log("\n🧹 Shutting down test server...");
      server.kill("SIGTERM");
      setTimeout(() => server?.kill("SIGKILL"), 5000);
    }
  }
}

main();
