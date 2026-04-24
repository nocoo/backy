import { json, type HandlerResponse } from "../http/response";
import type { RuntimeContext } from "../runtime";

export type IpInfoFetcher = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

const defaultFetcher: IpInfoFetcher = (url, init) => fetch(url, init);

export async function ipInfoHandler(
  input: { ip: string | null },
  ctx: RuntimeContext,
  fetcher: IpInfoFetcher = defaultFetcher,
): Promise<HandlerResponse> {
  const echoUrl = ctx.env.ECHO_API_URL ?? "";
  const echoKey = ctx.env.ECHO_API_KEY ?? "";
  if (!echoUrl) {
    return json(503, { error: "IP info service not configured" });
  }
  try {
    if (!input.ip) {
      return json(400, { error: "Missing ip parameter" });
    }
    const res = await fetcher(
      `${echoUrl}?ip=${encodeURIComponent(input.ip)}`,
      { headers: { "x-api-key": echoKey } },
    );
    if (!res.ok) {
      console.error(`Echo API error: ${res.status} ${res.statusText}`);
      return json(502, { error: "IP info service unavailable" });
    }
    const data: unknown = await res.json();
    return json(200, data);
  } catch (error) {
    console.error("Failed to fetch IP info:", error);
    return json(500, { error: "Failed to fetch IP info" });
  }
}
