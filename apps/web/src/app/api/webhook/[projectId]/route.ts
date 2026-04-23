import {
  webhookHeadHandler,
  webhookGetHandler,
  webhookPostHandler,
} from "@backy/api/handlers/webhook";
import { getClientIp } from "@backy/api/ip";
import { toResponse } from "@/lib/http";

function ctx(request: Request) {
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
  return toResponse(await webhookHeadHandler({ projectId, ...ctx(request) }));
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const url = new URL(request.url);
  const environment = url.searchParams.get("environment") ?? undefined;
  return toResponse(
    await webhookGetHandler({
      projectId,
      ...ctx(request),
      ...(environment !== undefined && { environment }),
    }),
  );
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { projectId } = await params;
  const formData = await request.formData();
  return toResponse(
    await webhookPostHandler({ projectId, ...ctx(request), formData }),
  );
}
