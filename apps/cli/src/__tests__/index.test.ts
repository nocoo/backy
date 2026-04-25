import { describe, expect, test } from "vitest";
import { PACKAGE_NAME, main } from "../index";

describe("@backy/cli placeholder", () => {
  test("exports the package name stamp", () => {
    expect(PACKAGE_NAME).toBe("@backy/cli");
  });

  test("main returns version stamp on --version", () => {
    expect(main(["--version"])).toContain("@backy/cli");
  });

  test("main returns version stamp on -v", () => {
    expect(main(["-v"])).toContain("@backy/cli");
  });

  test("main returns not-implemented notice without flags", () => {
    expect(main([])).toContain("not yet implemented");
  });

  test("main with no args reads from process.argv", () => {
    const original = process.argv;
    process.argv = ["bun", "cli"];
    try {
      expect(main()).toContain("not yet implemented");
    } finally {
      process.argv = original;
    }
  });
});
