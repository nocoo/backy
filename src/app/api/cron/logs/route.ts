/**
 * GET  /api/cron/logs — List cron logs with filtering and pagination.
 * DELETE /api/cron/logs — Delete cron logs matching filters.
 *
 * Both require session auth.
 */

import { NextRequest, NextResponse } from "next/server";
import { listCronLogs, deleteCronLogs } from "@/lib/db/cron-logs";
import type { CronLogStatus } from "@/lib/db/cron-logs";

const VALID_STATUSES: CronLogStatus[] = ["triggered", "skipped", "success", "failed"];

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const statusParam = url.searchParams.get("status") ?? undefined;
  const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(url.searchParams.get("pageSize")) || 50));

  const status = statusParam && VALID_STATUSES.includes(statusParam as CronLogStatus)
    ? (statusParam as CronLogStatus)
    : undefined;

  try {
    const result = await listCronLogs({ projectId, status, page, pageSize });
    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list cron logs:", error);
    return NextResponse.json({ error: "Failed to list cron logs" }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId") ?? undefined;
  const statusParam = url.searchParams.get("status") ?? undefined;

  const status = statusParam && VALID_STATUSES.includes(statusParam as CronLogStatus)
    ? (statusParam as CronLogStatus)
    : undefined;

  try {
    await deleteCronLogs({ projectId, status });
    return new NextResponse(null, { status: 204 });
  } catch (error) {
    console.error("Failed to delete cron logs:", error);
    return NextResponse.json({ error: "Failed to delete cron logs" }, { status: 500 });
  }
}
