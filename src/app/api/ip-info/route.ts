import { NextResponse } from "next/server";

const ECHO_API_URL = "https://echo.nocoo.cloud/api/ip";
const ECHO_API_KEY = process.env.ECHO_API_KEY ?? "";

/**
 * GET /api/ip-info?ip=x.x.x.x — Proxy IP geolocation lookup to echo.nocoo.cloud.
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const ip = searchParams.get("ip");

    if (!ip) {
      return NextResponse.json({ error: "Missing ip parameter" }, { status: 400 });
    }

    const res = await fetch(`${ECHO_API_URL}?ip=${encodeURIComponent(ip)}`, {
      headers: { "x-api-key": ECHO_API_KEY },
      next: { revalidate: 86400 }, // Cache for 24h — IP geo rarely changes
    });

    if (!res.ok) {
      console.error(`Echo API error: ${res.status} ${res.statusText}`);
      return NextResponse.json(
        { error: "IP info service unavailable" },
        { status: 502 },
      );
    }

    const data: unknown = await res.json();
    return NextResponse.json(data);
  } catch (error) {
    console.error("Failed to fetch IP info:", error);
    return NextResponse.json(
      { error: "Failed to fetch IP info" },
      { status: 500 },
    );
  }
}
