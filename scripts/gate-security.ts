/**
 * G2 Security Gate — osv-scanner + gitleaks
 *
 * Hard-fail behavior: if either tool is missing from $PATH,
 * the script exits non-zero immediately.
 *
 * Both scanners run in parallel:
 * - gitleaks: hard fail on any leaked secret
 * - osv-scanner: report vulnerabilities (warn-only, no hard fail)
 *   Rationale: indirect dependency vulnerabilities are often unfixable
 *   without upstream releases. The gate provides visibility, not blockage.
 */

import { $ } from "bun";

interface ScanResult {
  name: string;
  ok: boolean;
  warn: boolean;
  output: string;
}

function toolExists(name: string): boolean {
  try {
    const result = Bun.spawnSync(["which", name]);
    return result.exitCode === 0;
  } catch {
    return false;
  }
}

async function runOsvScanner(): Promise<ScanResult> {
  const name = "osv-scanner";
  if (!toolExists(name)) {
    return {
      name,
      ok: false,
      warn: false,
      output: `❌ ${name} not found. Install: brew install osv-scanner`,
    };
  }

  try {
    const result = await $`osv-scanner scan --lockfile=bun.lock 2>&1`.quiet().nothrow();
    const output = result.text();

    // osv-scanner exits 0 = no vulns, 1 = vulns found, other = error
    if (result.exitCode === 0) {
      return { name, ok: true, warn: false, output: `✅ ${name}: no vulnerabilities found` };
    }
    // Vulnerabilities found → warn only (indirect deps often unfixable)
    return {
      name,
      ok: true,
      warn: true,
      output: `⚠️  ${name}: vulnerabilities detected (warn-only, see output below)\n${output}`,
    };
  } catch (err) {
    return { name, ok: false, warn: false, output: `❌ ${name}: unexpected error — ${err}` };
  }
}

async function runGitleaks(): Promise<ScanResult> {
  const name = "gitleaks";
  if (!toolExists(name)) {
    return {
      name,
      ok: false,
      warn: false,
      output: `❌ ${name} not found. Install: brew install gitleaks`,
    };
  }

  try {
    const result = await $`gitleaks detect --source=. --no-banner 2>&1`.quiet().nothrow();
    const output = result.text();

    // gitleaks exits 0 = no leaks, 1 = leaks found
    if (result.exitCode === 0) {
      return { name, ok: true, warn: false, output: `✅ ${name}: no secrets detected` };
    }
    return { name, ok: false, warn: false, output: `❌ ${name}: secrets detected\n${output}` };
  } catch (err) {
    return { name, ok: false, warn: false, output: `❌ ${name}: unexpected error — ${err}` };
  }
}

async function main(): Promise<void> {
  console.log("🔒 G2 Security Gate\n");

  const results = await Promise.all([runOsvScanner(), runGitleaks()]);

  for (const r of results) {
    console.log(r.output);
  }

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.log(`\n❌ G2 failed: ${failed.map((r) => r.name).join(", ")}`);
    process.exit(1);
  }

  const warned = results.filter((r) => r.warn);
  if (warned.length > 0) {
    console.log(`\n⚠️  G2 passed with warnings: ${warned.map((r) => r.name).join(", ")}`);
  } else {
    console.log("\n✅ G2 passed: all security checks clean");
  }
}

main();
