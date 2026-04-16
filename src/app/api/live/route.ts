import { APP_VERSION } from "@/lib/version";
import { executeD1Query, isD1Configured } from "@/lib/db/d1-client";
import { pingR2, isR2Configured } from "@/lib/r2/client";

export const dynamic = "force-dynamic";

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

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

/** Sanitize error messages to never contain "ok" (prevents false-positive keyword monitors). */
function sanitizeMessage(msg: string): string {
  return msg.replace(/\bok\b/gi, "***");
}

export async function GET() {
  const timestamp = new Date().toISOString();
  const uptime = Math.floor(process.uptime());

  let database: { connected: boolean; error?: string } = { connected: false };
  try {
    if (!isD1Configured()) {
      throw new Error("D1 credentials not configured");
    }
    await checkWithTimeout(
      () => executeD1Query("SELECT 1"),
      HEALTH_CHECK_TIMEOUT_MS,
    );
    database = { connected: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    database = { connected: false, error: sanitizeMessage(msg) };
  }

  // R2 check (non-blocking for health status, but reported)
  let r2: { connected: boolean; error?: string } = { connected: false };
  try {
    if (!isR2Configured()) {
      throw new Error("R2 credentials not configured");
    }
    await checkWithTimeout(() => pingR2(), HEALTH_CHECK_TIMEOUT_MS);
    r2 = { connected: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    r2 = { connected: false, error: sanitizeMessage(msg) };
  }

  const healthy = database.connected;

  return Response.json(
    {
      status: healthy ? "ok" : "error",
      version: APP_VERSION,
      component: "backy",
      timestamp,
      uptime,
      database,
      r2,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
