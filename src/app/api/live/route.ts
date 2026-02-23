import { NextResponse } from "next/server";
import { executeD1Query, isD1Configured } from "@/lib/db/d1-client";
import { pingR2, isR2Configured } from "@/lib/r2/client";

const HEALTH_CHECK_TIMEOUT_MS = 5_000;
const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION ?? "unknown";

interface DependencyStatus {
  status: "up" | "down";
  latency_ms: number;
  message?: string;
}

async function checkWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
): Promise<T> {
  return Promise.race([
    fn(),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("check timed out")), timeoutMs),
    ),
  ]);
}

async function checkD1(): Promise<DependencyStatus> {
  if (!isD1Configured()) {
    return { status: "down", latency_ms: 0, message: "D1 credentials not configured" };
  }

  const start = performance.now();
  try {
    await checkWithTimeout(
      () => executeD1Query("SELECT 1"),
      HEALTH_CHECK_TIMEOUT_MS,
    );
    return { status: "up", latency_ms: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Math.round(performance.now() - start),
      message: err instanceof Error ? err.message : "D1 unreachable",
    };
  }
}

async function checkR2(): Promise<DependencyStatus> {
  if (!isR2Configured()) {
    return { status: "down", latency_ms: 0, message: "R2 credentials not configured" };
  }

  const start = performance.now();
  try {
    await checkWithTimeout(
      () => pingR2(),
      HEALTH_CHECK_TIMEOUT_MS,
    );
    return { status: "up", latency_ms: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Math.round(performance.now() - start),
      message: err instanceof Error ? err.message : "R2 unreachable",
    };
  }
}

/** Sanitize error messages to never contain "ok" (prevents false-positive keyword monitors). */
function sanitizeMessage(msg: string): string {
  return msg.replace(/\bok\b/gi, "***");
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const [d1, r2] = await Promise.all([checkD1(), checkR2()]);

  const allUp = d1.status === "up" && r2.status === "up";

  // Sanitize error messages to avoid "ok" in any failure output
  if (d1.message) d1.message = sanitizeMessage(d1.message);
  if (r2.message) r2.message = sanitizeMessage(r2.message);

  const body = {
    status: allUp ? "ok" : "error",
    version: APP_VERSION,
    timestamp,
    uptime_s: Math.floor(process.uptime()),
    dependencies: { d1, r2 },
  };

  return NextResponse.json(body, {
    status: allUp ? 200 : 503,
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      Pragma: "no-cache",
    },
  });
}
