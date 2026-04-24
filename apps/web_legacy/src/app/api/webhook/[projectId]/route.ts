import {
  webhookHeadHandler,
  webhookGetHandler,
  webhookPostHandler,
} from "@backy/api/handlers/webhook";
import { getClientIp } from "@backy/api/ip";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

function reqCtx(request: Request) {
  return {
    authorization: request.headers.get("authorization"),
    clientIp: getClientIp(request),
    userAgent: request.headers.get("user-agent"),
  };
}

export async function HEAD(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return toResponse(
    await webhookHeadHandler({ projectId, ...reqCtx(request) }, getCtx()),
  );
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const url = new URL(request.url);
  const environment = url.searchParams.get("environment") ?? undefined;
  return toResponse(
    await webhookGetHandler(
      {
        projectId,
        ...reqCtx(request),
        ...(environment !== undefined && { environment }),
      },
      getCtx(),
    ),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  return toResponse(
    await webhookPostHandler(
      {
        projectId,
        ...reqCtx(request),
        formData: () => request.formData(),
      },
      getCtx(),
    ),
  );
}
