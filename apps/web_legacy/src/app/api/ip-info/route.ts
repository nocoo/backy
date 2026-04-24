import { ipInfoHandler } from "@backy/api/handlers/ip-info";
import { toResponse } from "@/lib/http";
import { getCtx } from "@/lib/runtime";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get("ip");
  return toResponse(
    await ipInfoHandler({ ip }, getCtx(), (url, init) =>
      fetch(url, {
        ...init,
        next: { revalidate: 86400 },
      }),
    ),
  );
}
