/**
 * E2E test runner — starts a local dev server with E2E_SKIP_AUTH=true,
 * runs all E2E tests, cleans up test data, and exits.
 */

import { spawn } from "child_process";
import { runE2ETests } from "./e2e-tests";

const PORT = 7027; // Use a different port to avoid conflicts with dev server
const BASE_URL = `http://localhost:${PORT}`;
const STARTUP_TIMEOUT = 30_000; // 30s for Next.js to compile

async function waitForServer(url: string, timeout: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    try {
      const res = await fetch(`${url}/api/live`);
      if (res.ok) return;
    } catch {
      // Server not ready yet
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Server failed to start within ${timeout / 1000}s`);
}

async function main() {
  console.log("🚀 Starting E2E test server on port", PORT);

  // Start Next.js dev server with auth bypass
  const server = spawn("bun", ["next", "dev", "--port", String(PORT)], {
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

  try {
    console.log("⏳ Waiting for server to be ready...");
    await waitForServer(BASE_URL, STARTUP_TIMEOUT);
    console.log("✅ Server is ready\n");

    // Run the actual E2E tests
    const { passed, failed, total } = await runE2ETests(BASE_URL);

    console.log("\n" + "=".repeat(60));
    console.log(`E2E Results: ${passed}/${total} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\n❌ E2E runner error:", error);
    if (serverOutput) {
      console.error("\nServer output:\n", serverOutput.slice(-2000));
    }
    process.exitCode = 1;
  } finally {
    console.log("\n🧹 Shutting down test server...");
    server.kill("SIGTERM");

    // Force kill after 5s
    setTimeout(() => {
      server.kill("SIGKILL");
    }, 5000);
  }
}

main();
