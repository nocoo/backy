import { json, type HandlerResponse } from "../http/response";
import type { RuntimeContext } from "../runtime";

const HEALTH_CHECK_TIMEOUT_MS = 5_000;

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

async function checkD1(ctx: RuntimeContext): Promise<DependencyStatus> {
  const start = performance.now();
  try {
    await checkWithTimeout(
      () => ctx.db.query("SELECT 1"),
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

async function checkR2(ctx: RuntimeContext): Promise<DependencyStatus> {
  const start = performance.now();
  try {
    await checkWithTimeout(() => ctx.r2.ping(), HEALTH_CHECK_TIMEOUT_MS);
    return { status: "up", latency_ms: Math.round(performance.now() - start) };
  } catch (err) {
    return {
      status: "down",
      latency_ms: Math.round(performance.now() - start),
      message: err instanceof Error ? err.message : "R2 unreachable",
    };
  }
}

function sanitizeMessage(msg: string): string {
  return msg.replace(/\bok\b/gi, "***");
}

export async function liveCheckHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  const timestamp = new Date().toISOString();
  const [d1, r2] = await Promise.all([checkD1(ctx), checkR2(ctx)]);

  const allUp = d1.status === "up" && r2.status === "up";

  if (d1.message) d1.message = sanitizeMessage(d1.message);
  if (r2.message) r2.message = sanitizeMessage(r2.message);

  const uptime = ctx.info.uptimeSeconds();
  const body = {
    status: allUp ? "ok" : "error",
    version: ctx.env.NEXT_PUBLIC_APP_VERSION ?? "unknown",
    timestamp,
    uptime_s: uptime ?? 0,
    dependencies: { d1, r2 },
  };

  return json(allUp ? 200 : 503, body, {
    "Cache-Control": "no-store, no-cache, must-revalidate",
    Pragma: "no-cache",
  });
}
