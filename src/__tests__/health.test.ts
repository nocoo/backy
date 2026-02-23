import { describe, expect, test } from "bun:test";

describe("health check", () => {
  test("returns ok status", async () => {
    // Import the route handler directly
    const { GET } = await import("@/app/api/live/route");
    const response = GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});
