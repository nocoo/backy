/**
 * Backy Cron Worker
 *
 * Cloudflare Worker with a Cron Trigger that fires every hour.
 * It calls Backy's /api/cron/trigger endpoint to initiate
 * auto-backup triggers for all configured projects.
 *
 * Required secrets (set via `wrangler secret put`):
 *   CRON_SECRET — shared secret matching Backy's CRON_SECRET env var
 */

interface Env {
  BACKY_URL: string;
  CRON_SECRET: string;
}

export default {
  async scheduled(
    _controller: ScheduledController,
    env: Env,
    ctx: ExecutionContext,
  ): Promise<void> {
    const url = `${env.BACKY_URL}/api/cron/trigger`;

    const task = fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${env.CRON_SECRET}`,
        "Content-Type": "application/json",
      },
    }).then(async (res) => {
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        console.error(
          `Cron trigger failed: ${res.status} ${res.statusText}`,
          body,
        );
        return;
      }
      const data = await res.json();
      console.log("Cron trigger result:", JSON.stringify(data));
    });

    ctx.waitUntil(task);
  },
} satisfies ExportedHandler<Env>;
