import { describe, expect, test } from "bun:test";

const { GET } = await import("@/app/api/live/route");

describe("/api/live", () => {
  test("returns 200 with expected body", async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(typeof body.version).toBe("string");
    expect(body.component).toBe("backy");
  });

  test("sets Cache-Control: no-store header", async () => {
    const response = await GET();

    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });
});
