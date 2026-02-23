import { describe, expect, test } from "bun:test";
import { isD1Configured } from "@/lib/db/d1-client";

describe("D1 client", () => {
  test("isD1Configured returns true when env vars are set", () => {
    // The .env file has D1 credentials configured
    expect(isD1Configured()).toBe(true);
  });
});
