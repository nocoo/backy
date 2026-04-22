/**
 * E2E test project constants — single source of truth.
 *
 * Imported by:
 * - src/app/api/db/seed-test-project/route.ts (server-side seed)
 * - e2e/api/config.ts (test-side seed caller + suites)
 */
export const TEST_PROJECT = {
  id: "mnp039joh6yiala5UY0Hh",
  name: "backy-test",
  webhookToken: "wDzglaK3i-tTUmHsTsCdTWQVTeZWSn9tGfCaW4lR1f3JPGzJ",
  description: "E2E test project — auto-seeded",
} as const;
