/**
 * E2E test configuration — shared constants and state containers.
 */

export const PROJECT_ID = "mnp039joh6yiala5UY0Hh";
export const WEBHOOK_TOKEN = "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ";
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
