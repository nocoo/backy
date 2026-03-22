/**
 * Load .env.test overrides for E2E test isolation.
 *
 * Three-layer safety:
 * 1. File must exist (.env.test)
 * 2. Both D1_DATABASE_ID and R2_BUCKET_NAME must be present in overrides
 * 3. Neither value may equal the production value from .env or process.env
 *
 * Layer 3 checks .env first, then falls back to process.env. If neither
 * source has a production value, the function fails closed — it refuses
 * to proceed without verifiable isolation.
 *
 * If any check fails, the runner aborts — E2E will never silently hit production.
 *
 * Parser handles standard dotenv conventions:
 * - Comments (#) and blank lines are skipped
 * - Surrounding quotes (single or double) are stripped from values
 * - Inline comments after values are stripped (e.g. KEY=value # comment)
 */
import { readFileSync } from "fs";
import { join } from "path";

/** Keys that .env.test MUST override to ensure test isolation. */
const REQUIRED_OVERRIDES = ["D1_DATABASE_ID", "R2_BUCKET_NAME"] as const;

/** Strip surrounding quotes and inline comments from a dotenv value. */
function parseValue(raw: string): string {
  let value = raw.trim();
  // Strip surrounding quotes: "val" or 'val'
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    value = value.slice(1, -1);
  } else {
    // Strip inline comment (only when not quoted)
    const hashIndex = value.indexOf(" #");
    if (hashIndex !== -1) {
      value = value.slice(0, hashIndex).trimEnd();
    }
  }
  return value;
}

/** Parse a dotenv file into a key-value map. */
function parseDotenv(filePath: string): Record<string, string> {
  const content = readFileSync(filePath, "utf-8");
  const result: Record<string, string> = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = parseValue(trimmed.slice(eqIndex + 1));
    result[key] = value;
  }
  return result;
}

export function loadTestEnv(): Record<string, string> {
  const projectRoot = process.cwd();
  const envTestPath = join(projectRoot, ".env.test");
  const envPath = join(projectRoot, ".env");

  // Layer 1: .env.test must exist
  let overrides: Record<string, string>;
  try {
    overrides = parseDotenv(envTestPath);
  } catch {
    throw new Error(
      ".env.test not found — E2E tests require separate test resources.\n" +
        "Create .env.test with D1_DATABASE_ID and R2_BUCKET_NAME for the test database/bucket.\n" +
        "See .env.example for details.",
    );
  }

  // Layer 2: required keys must be present and non-empty
  for (const key of REQUIRED_OVERRIDES) {
    if (!overrides[key]) {
      throw new Error(
        `.env.test is missing required key: ${key}\n` +
          "Both D1_DATABASE_ID and R2_BUCKET_NAME must be set to test-specific values.",
      );
    }
  }

  // Layer 3: test values must differ from production values
  //
  // Primary source: parse .env from disk (explicit, not runtime-dependent).
  // Fallback source: process.env (covers CI / shell-inherited credentials).
  // If neither source has a value for a key, we cannot verify isolation —
  // fail closed rather than silently proceeding.
  let prodEnv: Record<string, string> = {};
  try {
    prodEnv = parseDotenv(envPath);
  } catch {
    // .env doesn't exist — fall through to process.env comparison below
  }
  for (const key of REQUIRED_OVERRIDES) {
    // Try .env first, then fall back to process.env
    const prodValue = prodEnv[key] || process.env[key];
    if (!prodValue) {
      throw new Error(
        `Cannot verify test isolation for ${key}: no production value found.\n` +
          `Neither .env nor process.env contains ${key}.\n` +
          "Ensure .env exists with production credentials, or that the environment provides them.",
      );
    }
    if (overrides[key] === prodValue) {
      throw new Error(
        `.env.test ${key} is identical to the production value!\n` +
          `Production: ${prodValue}\n` +
          `Test:       ${overrides[key]}\n` +
          "E2E tests MUST use separate resources. Fix .env.test to point to the test database/bucket.",
      );
    }
  }

  return { ...process.env, ...overrides } as Record<string, string>;
}
