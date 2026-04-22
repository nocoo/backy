#!/usr/bin/env bun
/**
 * @backy/cli — placeholder entry point.
 *
 * Reserved for the next refactor wave: AI-facing CLI for managing backups,
 * projects, and restore flows. Currently prints a stamp so the bin can be
 * invoked end-to-end without runtime errors.
 */
export const PACKAGE_NAME = "@backy/cli";

export function main(argv: readonly string[] = Bun.argv.slice(2)): string {
  if (argv.includes("--version") || argv.includes("-v")) {
    return PACKAGE_NAME + " (placeholder)";
  }
  return PACKAGE_NAME + " — not yet implemented. Coming in the next wave.";
}

if (import.meta.main) {
  console.log(main());
}
