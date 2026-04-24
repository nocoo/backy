/**
 * Coverage gate — parses bun test --coverage output and fails if below threshold.
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

// Print original output
process.stdout.write(stdout);
process.stderr.write(stderr);

if (exitCode !== 0) {
  console.error("\n❌ Tests failed — cannot check coverage.");
  process.exit(1);
}

// Coverage table may appear in stdout or stderr depending on bun version
const output = stdout + "\n" + stderr;

// Parse per-file rows for files owned by this workspace (src/...). Files from
// packages/api appear with a "../../packages/api/" prefix and are gated by
// their own workspace's coverage check; including them here would double-count.
const rowRe =
  /^\s*(\S+\.ts(?:x)?)\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)\s*\|/gm;
let m: RegExpExecArray | null;
let totalFuncs = 0;
let totalLines = 0;
let count = 0;
while ((m = rowRe.exec(output)) !== null) {
  const path = m[1] ?? "";
  if (path.startsWith("../") || path.startsWith("All files")) continue;
  totalFuncs += parseFloat(m[2] ?? "0");
  totalLines += parseFloat(m[3] ?? "0");
  count++;
}

if (count === 0) {
  console.error("\n❌ Could not parse coverage output.");
  process.exit(1);
}

const funcCov = totalFuncs / count;
const lineCov = totalLines / count;

console.log(
  `\n📊 Coverage (apps/worker only, ${count} files): ${funcCov.toFixed(2)}% functions, ${lineCov.toFixed(2)}% lines (threshold: ${THRESHOLD}%)`,
);

if (funcCov < THRESHOLD || lineCov < THRESHOLD) {
  console.error(`❌ Coverage below ${THRESHOLD}% — failing.`);
  process.exit(1);
}

console.log("✅ Coverage threshold met.");
