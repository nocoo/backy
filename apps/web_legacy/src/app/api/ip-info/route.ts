import { ipInfoHandler } from "@backy/api/handlers/ip-info";
import { toResponse } from "@/lib/http";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const ip = searchParams.get("ip");
  return toResponse(
    await ipInfoHandler({ ip }, (url, init) =>
      fetch(url, {
        ...init,
        // Cache for 24h — IP geo rarely changes
        next: { revalidate: 86400 },
      }),
    ),
  );
}
