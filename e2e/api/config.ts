/**
 * E2E test configuration — shared constants and state containers.
 */

// === Test project constants — re-exported from single source of truth ===
// Uses relative path because e2e/ is excluded from tsconfig.json,
// making the @/ alias unreliable for path resolution in this context.
import { TEST_PROJECT } from "../../src/lib/test-project";
export { TEST_PROJECT };

export const PROJECT_ID = TEST_PROJECT.id;
export const WEBHOOK_TOKEN = TEST_PROJECT.webhookToken;
export const PROJECT_NAME = TEST_PROJECT.name;
export const E2E_TAG_PREFIX = "e2e-test-";

// Test data — a known JSON object to round-trip
export const TEST_JSON_DATA = {
  _e2e: true,
  timestamp: new Date().toISOString(),
  settings: {
    theme: "dark",
    language: "en",
    notifications: { email: true, push: false },
  },
  items: [
    { id: 1, name: "Alpha", active: true },
    { id: 2, name: "Beta", active: false },
    { id: 3, name: "Gamma", active: true },
  ],
};

// Mutable state shared across suites — reset by runner before each run
export const state = {
  baseUrl: "",
  createdBackupIds: [] as string[],
  createdCategoryIds: [] as string[],
  createdProjectIds: [] as string[],
};

/**
 * Ensure the backy-test project exists in a known baseline state.
 *
 * Calls the narrow /api/db/seed-test-project endpoint which:
 * 1. Project doesn't exist → create with all defaults
 * 2. Project exists in correct baseline → no-op
 * 3. Project exists but any field is dirty → full reset to baseline
 */
export async function seedTestProject(baseUrl: string): Promise<void> {
  const seedRes = await fetch(`${baseUrl}/api/db/seed-test-project`, {
    method: "POST",
  });
  if (!seedRes.ok) {
    const err = await seedRes.text();
    throw new Error(`Failed to seed test project: ${err}`);
  }
  const result = (await seedRes.json()) as {
    action: string;
    cleanedBackups: number;
  };
  console.log(
    `  ✅ Test project: ${result.action}${result.cleanedBackups > 0 ? ` (cleaned ${result.cleanedBackups} orphaned backups)` : ""}`,
  );
}
