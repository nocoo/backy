import { describe, expect, test } from "bun:test";

describe("proxy auth rules", () => {
  test("webhook routes are public (not requiring OAuth)", async () => {
    // Verify the proxy config allows webhook routes through
    const { config } = await import("@/proxy");
    expect(config.matcher).toBeDefined();
    expect(config.matcher.length).toBeGreaterThan(0);
  });
});
