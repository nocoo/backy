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

process.stdout.write(stdout);
process.stderr.write(stderr);

if (exitCode !== 0) {
  console.error("\n❌ Tests failed — cannot check coverage.");
  process.exit(1);
}

const output = stdout + "\n" + stderr;

const allFilesMatch = output.match(
  /All files\s*\|\s*([\d.]+)\s*\|\s*([\d.]+)/,
);

if (!allFilesMatch) {
  console.error("\n❌ Could not parse coverage output.");
  process.exit(1);
}

const funcCov = parseFloat(allFilesMatch[1] ?? "0");
const lineCov = parseFloat(allFilesMatch[2] ?? "0");

console.log(`\n📊 Coverage: ${funcCov}% functions, ${lineCov}% lines (threshold: ${THRESHOLD}%)`);

if (funcCov < THRESHOLD || lineCov < THRESHOLD) {
  console.error(`❌ Coverage below ${THRESHOLD}% — failing.`);
  process.exit(1);
}

console.log("✅ Coverage threshold met.");
