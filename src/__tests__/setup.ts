/**
 * Global test setup for all test files.
 * Sets mock D1 credentials so tests don't require real env vars.
 */

// Set mock D1 credentials before any tests run
process.env.D1_ACCOUNT_ID ??= "test-account-id";
process.env.D1_DATABASE_ID ??= "test-database-id";
process.env.D1_API_TOKEN ??= "test-api-token";
