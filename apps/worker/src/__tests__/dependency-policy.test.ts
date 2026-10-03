import { readFileSync } from "node:fs";
import { describe, expect, test } from "vitest";

interface DependencyPolicy {
  engines?: { node?: string };
  overrides: Record<string, string>;
}

const root = new URL("../../../../", import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL("package.json", root), "utf8"),
) as DependencyPolicy;
const lockfile = readFileSync(new URL("bun.lock", root), "utf8");

describe("undici dependency policy (#691)", () => {
  test("pins the verified stable undici release", () => {
    expect(manifest.overrides.undici).toBe("8.11.2");
  });

  test("declares the Node minimum required by undici 8", () => {
    expect(manifest.engines?.node).toBe(">=22.19.0");
  });

  test("locks every undici resolution to the override", () => {
    const resolutions = Array.from(
      lockfile.matchAll(/"(?:[^"]+\/)?undici": \["undici@([^"]+)"/g),
      (match) => match[1],
    );
    expect(resolutions.length).toBeGreaterThan(0);
    expect(new Set(resolutions)).toEqual(new Set([manifest.overrides.undici]));
    expect(lockfile).toContain(`"undici": "${manifest.overrides.undici}"`);
  });
});
