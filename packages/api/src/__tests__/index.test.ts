import { describe, expect, test } from "vitest";
import { PACKAGE_NAME } from "../index";

describe("@backy/api placeholder", () => {
  test("exports the package name stamp", () => {
    expect(PACKAGE_NAME).toBe("@backy/api");
  });
});
