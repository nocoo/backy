// Test preload: ensure D1 env vars are set for all tests
// Without this, tests that import d1-client functions fail on CI
// where no .env file provides these values
if (!process.env.D1_ACCOUNT_ID) process.env.D1_ACCOUNT_ID = "test-account-id";
if (!process.env.D1_DATABASE_ID) process.env.D1_DATABASE_ID = "test-database-id";
if (!process.env.D1_API_TOKEN) process.env.D1_API_TOKEN = "test-api-token";

// R2 env vars for backup tests
if (!process.env.R2_ACCESS_KEY_ID) process.env.R2_ACCESS_KEY_ID = "test-r2-key";
if (!process.env.R2_SECRET_ACCESS_KEY) process.env.R2_SECRET_ACCESS_KEY = "test-r2-secret";
if (!process.env.R2_ENDPOINT) process.env.R2_ENDPOINT = "https://test.r2.dev";
if (!process.env.R2_BUCKET_NAME) process.env.R2_BUCKET_NAME = "test-bucket";
