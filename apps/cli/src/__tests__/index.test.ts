import { describe, expect, test } from "vitest";
import { PACKAGE_NAME, main } from "../index";

describe("@backy/cli placeholder", () => {
  test("exports the package name stamp", () => {
    expect(PACKAGE_NAME).toBe("@backy/cli");
  });

  test("main returns version stamp on --version", () => {
    expect(main(["--version"])).toBe("@backy/cli (placeholder)");
  });

  test("main returns version stamp on -v", () => {
    expect(main(["-v"])).toBe("@backy/cli (placeholder)");
  });

  test("main returns not-implemented notice without flags", () => {
    expect(main([])).toBe(
      "@backy/cli — not yet implemented. Coming in the next wave.",
    );
  });

  test("main with no args reads from process.argv", () => {
    const original = process.argv;
    process.argv = ["bun", "cli"];
    try {
      expect(main()).toBe(
        "@backy/cli — not yet implemented. Coming in the next wave.",
      );
    } finally {
      process.argv = original;
    }
  });
});
