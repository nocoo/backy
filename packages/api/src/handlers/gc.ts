import {
  cronTriggerHandler,
  type CronTriggerInput,
} from "./cron";
import {
  ARCHIVE_AFTER_SECONDS,
  GC_BATCH_SIZE,
  GC_BUDGET_MS,
  unixNow,
} from "../lib/direct-upload";
import {
  deleteArchivedDirectUploads,
  listGcBatch,
  updateDirectUploadGc,
  type DirectUploadRow,
} from "../lib/db/direct-uploads";
import { getBackupByFileKey } from "../lib/db/backups";
import type { RuntimeContext } from "../runtime";

async function sweepOne(
  ctx: RuntimeContext,
  row: DirectUploadRow,
  now: number,
): Promise<void> {
  const backup = await getBackupByFileKey(ctx.db, row.file_key);
  const hasBackup = Boolean(backup);

  try {
    if (row.status === "completed" && hasBackup) {
      try {
        await ctx.r2.delete(row.staging_key);
      } catch (err) {
        console.error("GC staging delete failed:", err);
        await updateDirectUploadGc(ctx.db, {
          id: row.id,
          nextGcAt: now + 3600,
        });
        return;
      }
      await updateDirectUploadGc(ctx.db, {
        id: row.id,
        nextGcAt: now + ARCHIVE_AFTER_SECONDS,
      });
      return;
    }

    if (row.status === "completing") {
      if (row.lease_expires_at !== null && row.lease_expires_at >= now) {
        await updateDirectUploadGc(ctx.db, {
          id: row.id,
          nextGcAt: Math.min(
            row.purge_after,
            row.lease_expires_at,
            now + 3600,
          ),
        });
        return;
      }
      if (hasBackup) {
        await updateDirectUploadGc(ctx.db, {
          id: row.id,
          nextGcAt: now + ARCHIVE_AFTER_SECONDS,
          status: "completed",
          backupId: backup?.id ?? null,
        });
        return;
      }
    }

    if (
      (row.status === "pending" ||
        row.status === "aborted" ||
        row.status === "expired" ||
        row.status === "completing" ||
        (row.status === "completed" && !hasBackup)) &&
      row.purge_after < now
    ) {
      try {
        await ctx.r2.delete(row.staging_key);
        await ctx.r2.delete(row.file_key);
      } catch (err) {
        console.error("GC object delete failed:", err);
        await updateDirectUploadGc(ctx.db, {
          id: row.id,
          nextGcAt: now + 3600,
        });
        return;
      }
      const nextStatus =
        row.status === "pending" || row.status === "completing"
          ? "expired"
          : row.status;
      const purgedAt = now >= row.reap_until ? now : null;
      await updateDirectUploadGc(ctx.db, {
        id: row.id,
        nextGcAt: now + 3600,
        status: nextStatus,
        ...(purgedAt !== null && { purgedAt }),
      });
      return;
    }

    await updateDirectUploadGc(ctx.db, {
      id: row.id,
      nextGcAt: Math.min(
        row.purge_after,
        row.lease_expires_at ?? row.purge_after,
        now + 3600,
      ),
    });
  } catch (err) {
    console.error("GC row failed:", err);
    await updateDirectUploadGc(ctx.db, { id: row.id, nextGcAt: now + 3600 });
  }
}

export async function gcDirectUploads(
  ctx: RuntimeContext,
  now = unixNow(),
): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < GC_BUDGET_MS) {
    const batch = await listGcBatch(ctx.db, now, GC_BATCH_SIZE);
    if (batch.length === 0) break;
    for (const row of batch) {
      await sweepOne(ctx, row, now);
      if (Date.now() - started >= GC_BUDGET_MS) break;
    }
    if (batch.length < GC_BATCH_SIZE) break;
  }
  await deleteArchivedDirectUploads(ctx.db, now - ARCHIVE_AFTER_SECONDS);
}

export async function runHourlyJobs(
  ctx: RuntimeContext,
  cronInput: CronTriggerInput,
): Promise<void> {
  let autoBackupError: unknown = null;
  try {
    const result = await cronTriggerHandler(cronInput, ctx);
    if (result.kind === "json" && result.status >= 400) {
      autoBackupError = new Error(
        `cron trigger failed: ${JSON.stringify(result.body)}`,
      );
    }
  } catch (err) {
    autoBackupError = err;
  }
  try {
    await gcDirectUploads(ctx);
  } catch (err) {
    console.error("direct-upload GC failed:", err);
  }
  if (autoBackupError) throw autoBackupError;
}
