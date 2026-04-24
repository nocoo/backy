import { describe, expect, test } from "bun:test";

describe("@backy/web scaffold", () => {
  test("App module is importable", async () => {
    const mod = await import("../App");
    expect(typeof mod.App).toBe("function");
  });
});
