/**
 * Coverage gate — parses bun test --coverage output and fails if below threshold.
 *
 * Scope: only files under `src/lib/` are gated. Pages and presentational
 * components in `src/pages/`, `src/components/` are exercised via L3 BDD
 * (Playwright) in a later wave; surface-only unit tests can't push their
 * coverage above zero without DOM rendering harnesses.
 *
 * Usage: bun run scripts/check-coverage.ts
 * Exits with code 1 if function or line coverage is below 90%.
 */

export const THRESHOLD = 90;

const proc = Bun.spawn(["bun", "test", "src/__tests__/", "--coverage"], {
  stdout: "pipe",
  stderr: "pipe",
});

const stdout = await new Response(proc.stdout).text();
const stderr = await new Response(proc.stderr).text();
const exitCode = await proc.exited;

process.stdout.write(stdout);
process.stderr.write(stderr);

if (exitCode !== 0) {
  console.error("\n❌ Tests failed — cannot check coverage.");
  process.exit(1);
}

const output = stdout + "\n" + stderr;

// Only gate src/lib/** — logic lives here. Pages/components are exercised by L3.
const rowRe =
  /^\s*(\S+\.ts(?:x)?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/gm;
let m: RegExpExecArray | null;
let totalFuncs = 0;
let totalLines = 0;
let count = 0;
const gatedFiles: string[] = [];
while ((m = rowRe.exec(output)) !== null) {
  const path = m[1] ?? "";
  if (!path.startsWith("src/lib/")) continue;
  totalFuncs += parseFloat(m[2] ?? "0");
  totalLines += parseFloat(m[3] ?? "0");
  count++;
  gatedFiles.push(path);
}

if (count === 0) {
  console.error("\n❌ Could not parse coverage output for src/lib/**.");
  process.exit(1);
}

const funcCov = totalFuncs / count;
const lineCov = totalLines / count;

console.log(
  `\n📊 Coverage (apps/web src/lib/**, ${count} files): ${funcCov.toFixed(2)}% functions, ${lineCov.toFixed(2)}% lines (threshold: ${THRESHOLD}%)`,
);

if (funcCov < THRESHOLD || lineCov < THRESHOLD) {
  console.error(`❌ Coverage below ${THRESHOLD}% — failing.`);
  console.error("Gated files:", gatedFiles.join(", "));
  process.exit(1);
}

console.log("✅ Coverage threshold met.");
