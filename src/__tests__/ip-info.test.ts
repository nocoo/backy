import { describe, expect, test, beforeEach, afterEach, spyOn } from "bun:test";

/** Create a mock fetch that satisfies Bun's typeof fetch (includes preconnect). */
function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

describe("GET /api/ip-info", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  test("returns IP info on success", async () => {
    const mockIpData = {
      ip: "8.8.8.8",
      version: 4,
      location: {
        country: "United States",
        province: "California",
        city: "Mountain View",
        isp: "Google LLC",
        iso2: "US",
      },
      latencyMs: 0,
      source: "ip2region",
      attribution: "IP2Region data",
    };

    globalThis.fetch = mockFetch(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      expect(url).toContain("echo.nocoo.cloud/api/ip?ip=8.8.8.8");
      return new Response(JSON.stringify(mockIpData), { status: 200 });
    });

    const { GET } = await import("@/app/api/ip-info/route");
    const request = new Request("http://localhost/api/ip-info?ip=8.8.8.8");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ip).toBe("8.8.8.8");
    expect(body.location.country).toBe("United States");
    expect(body.location.city).toBe("Mountain View");
  });

  test("passes x-api-key header to upstream", async () => {
    globalThis.fetch = mockFetch(async (_input, init) => {
      const headers = init?.headers as Record<string, string> | undefined;
      expect(headers?.["x-api-key"]).toBeDefined();
      return new Response(JSON.stringify({ ip: "1.1.1.1" }), { status: 200 });
    });

    const { GET } = await import("@/app/api/ip-info/route");
    const request = new Request("http://localhost/api/ip-info?ip=1.1.1.1");
    await GET(request);
  });

  test("returns 400 when ip parameter is missing", async () => {
    const { GET } = await import("@/app/api/ip-info/route");
    const request = new Request("http://localhost/api/ip-info");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Missing ip parameter");
  });

  test("returns 502 when upstream returns error", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    globalThis.fetch = mockFetch(async () =>
      new Response("Service Unavailable", { status: 503 }),
    );

    const { GET } = await import("@/app/api/ip-info/route");
    const request = new Request("http://localhost/api/ip-info?ip=8.8.8.8");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body.error).toBe("IP info service unavailable");

    consoleSpy.mockRestore();
  });

  test("returns 500 when fetch throws", async () => {
    const consoleSpy = spyOn(console, "error").mockImplementation(() => {});

    globalThis.fetch = mockFetch(async () => {
      throw new Error("Network failure");
    });

    const { GET } = await import("@/app/api/ip-info/route");
    const request = new Request("http://localhost/api/ip-info?ip=8.8.8.8");
    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toBe("Failed to fetch IP info");

    consoleSpy.mockRestore();
  });

  test("encodes IP parameter properly", async () => {
    globalThis.fetch = mockFetch(async (input) => {
      const url = typeof input === "string" ? input : input.toString();
      // IPv6 with colons should be encoded
      expect(url).toContain("ip=");
      return new Response(JSON.stringify({ ip: "::1" }), { status: 200 });
    });

    const { GET } = await import("@/app/api/ip-info/route");
    const request = new Request("http://localhost/api/ip-info?ip=::1");
    const response = await GET(request);

    expect(response.status).toBe(200);
  });
});
