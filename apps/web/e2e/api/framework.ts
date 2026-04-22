/**
 * Minimal BDD test framework for E2E API tests.
 */

export interface TestResult {
  name: string;
  passed: boolean;
  error?: string;
  duration: number;
}

export const results: TestResult[] = [];

export async function test(name: string, fn: () => Promise<void>): Promise<void> {
  const start = performance.now();
  try {
    await fn();
    const duration = performance.now() - start;
    results.push({ name, passed: true, duration });
    console.log(`  \u2705 ${name} (${duration.toFixed(0)}ms)`);
  } catch (err) {
    const duration = performance.now() - start;
    const error = err instanceof Error ? err.message : String(err);
    results.push({ name, passed: false, error, duration });
    console.log(`  \u274C ${name} (${duration.toFixed(0)}ms)`);
    console.log(`     ${error}`);
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`Assertion failed: ${message}`);
}

export function assertEqual<T>(actual: T, expected: T, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

export function assertDeepEqual(actual: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${label}: deep equality failed`);
  }
}
