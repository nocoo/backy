import pkg from "../package.json";

const VERSION = pkg.version;
const bootedAt = Date.now();

interface Env {
  DB: D1Database;
}

export async function handleLive(env: Env): Promise<Response> {
  const timestamp = new Date().toISOString();
  const uptime = Math.round((Date.now() - bootedAt) / 1000);

  let database: { connected: boolean; error?: string } = { connected: false };
  try {
    await env.DB.prepare("SELECT 1 AS probe").first();
    database = { connected: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    database = { connected: false, error: msg.replace(/\bok\b/gi, "***") };
  }

  const healthy = database.connected;

  return Response.json(
    {
      status: healthy ? "ok" : "error",
      version: VERSION,
      component: "backy-cron",
      timestamp,
      uptime,
      database,
    },
    {
      status: healthy ? 200 : 503,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
