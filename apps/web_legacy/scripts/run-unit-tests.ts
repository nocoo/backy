const decoder = new TextDecoder();

function parseCount(output: string, label: string): number {
  const match = output.match(new RegExp(`\\b(\\d+)\\s+${label}\\b`));
  return match ? Number(match[1]) : 0;
}

const files: string[] = [];
for await (const file of new Bun.Glob("src/__tests__/*.test.ts").scan(".")) {
  files.push(file);
}
files.sort();

let totalPass = 0;
let totalFail = 0;
let totalErrors = 0;
let totalExpectCalls = 0;
let totalTests = 0;
let crashedFiles = 0;

for (const file of files) {
  const proc = Bun.spawnSync(["bun", "test", file], {
    cwd: process.cwd(),
    stdout: "pipe",
    stderr: "pipe",
  });

  const output =
    decoder.decode(proc.stdout) + decoder.decode(proc.stderr);

  totalPass += parseCount(output, "pass");
  totalFail += parseCount(output, "fail");
  totalErrors += parseCount(output, "error");
  totalExpectCalls += parseCount(output, "expect\\(\\) calls");

  const ranMatch = output.match(/Ran\s+(\d+)\s+tests\s+across\s+\d+\s+file(?:s)?/);
  if (ranMatch) {
    totalTests += Number(ranMatch[1]);
  }

  if (proc.exitCode !== 0) {
    crashedFiles += 1;
    process.stdout.write(output);
    console.error(
      `\n[run-unit-tests] ${file} exited with code ${proc.exitCode} (signal=${proc.signalCode ?? "none"})`,
    );
  }
}

console.log();
console.log(`  ${totalPass} pass`);
console.log(`  ${totalFail} fail`);
if (totalErrors > 0) {
  console.log(`  ${totalErrors} error`);
}
console.log(`  ${totalExpectCalls} expect() calls`);
console.log(`Ran ${totalTests} tests across ${files.length} files.`);

if (crashedFiles > 0) {
  console.error(
    `\n${crashedFiles} test file(s) exited non-zero — treating as failure.`,
  );
}

if (totalFail > 0 || totalErrors > 0 || crashedFiles > 0) {
  process.exit(1);
}
