import { NextRequest, NextResponse } from "next/server";
import { listWebhookLogs, deleteWebhookLogs } from "@/lib/db/webhook-logs";

/**
 * GET /api/logs — List webhook audit logs with filtering and pagination.
 *
 * Query params:
 *   - projectId: filter by project (optional)
 *   - excludeProjectId: exclude a specific project (optional)
 *   - method: filter by HTTP method (optional)
 *   - statusCode: filter by exact status code (optional)
 *   - errorCode: filter by error code (optional)
 *   - success: "true" | "false" — filter by success/failure (optional)
 *   - page: page number, 1-based (default: 1)
 *   - pageSize: items per page (default: 50, max: 100)
 */
export async function GET(request: NextRequest) {
  try {
    const sp = request.nextUrl.searchParams;

    const projectId = sp.get("projectId") ?? undefined;
    const excludeProjectId = sp.get("excludeProjectId") ?? undefined;
    const method = sp.get("method") ?? undefined;
    const statusCodeRaw = sp.get("statusCode");
    const statusCode = statusCodeRaw ? parseInt(statusCodeRaw, 10) : undefined;
    const errorCode = sp.get("errorCode") ?? undefined;
    const successRaw = sp.get("success");
    const success =
      successRaw === "true" ? true : successRaw === "false" ? false : undefined;
    const page = Math.max(1, parseInt(sp.get("page") ?? "1", 10) || 1);
    const pageSize = Math.min(
      100,
      Math.max(1, parseInt(sp.get("pageSize") ?? "50", 10) || 50),
    );

    const result = await listWebhookLogs({
      projectId,
      excludeProjectId,
      method,
      statusCode: statusCode && !isNaN(statusCode) ? statusCode : undefined,
      errorCode,
      success,
      page,
      pageSize,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Failed to list webhook logs:", error);
    return NextResponse.json(
      { error: "Failed to list webhook logs" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/logs — Delete webhook logs matching filters.
 *
 * Body (JSON, all optional):
 *   - projectId: delete only logs for this project
 *   - method: delete only logs with this HTTP method
 *   - success: true | false — delete only success/failure logs
 *
 * If no filters are provided, deletes ALL logs.
 */
export async function DELETE(request: NextRequest) {
  try {
    const body: unknown = await request.json().catch(() => ({}));
    const { projectId, method, success } = (body ?? {}) as {
      projectId?: string;
      method?: string;
      success?: boolean;
    };

    await deleteWebhookLogs({ projectId, method, success });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete webhook logs:", error);
    return NextResponse.json(
      { error: "Failed to delete webhook logs" },
      { status: 500 },
    );
  }
}
