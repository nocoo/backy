import { json, type HandlerResponse } from "../http/response";

const ECHO_API_URL = process.env.ECHO_API_URL ?? "";
const ECHO_API_KEY = process.env.ECHO_API_KEY ?? "";

export type IpInfoFetcher = (
  url: string,
  init: { headers: Record<string, string> },
) => Promise<Response>;

const defaultFetcher: IpInfoFetcher = (url, init) => fetch(url, init);

export async function ipInfoHandler(
  input: { ip: string | null },
  fetcher: IpInfoFetcher = defaultFetcher,
): Promise<HandlerResponse> {
  if (!ECHO_API_URL) {
    return json(503, { error: "IP info service not configured" });
  }
  try {
    if (!input.ip) {
      return json(400, { error: "Missing ip parameter" });
    }
    const res = await fetcher(
      `${ECHO_API_URL}?ip=${encodeURIComponent(input.ip)}`,
      { headers: { "x-api-key": ECHO_API_KEY } },
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
