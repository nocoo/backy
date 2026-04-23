// Stub external service credentials so library code that reads process.env at
// call time does not throw "credentials not configured" during unit tests.
// All outbound HTTP/S3 calls are mocked per-test, so these values are never
// actually used to authenticate.
process.env.D1_ACCOUNT_ID ||= "test-account";
process.env.D1_DATABASE_ID ||= "test-db";
process.env.D1_API_TOKEN ||= "test-token";
process.env.R2_ACCOUNT_ID ||= "test-account";
process.env.R2_ACCESS_KEY_ID ||= "test-key";
process.env.R2_SECRET_ACCESS_KEY ||= "test-secret";
process.env.R2_BUCKET_NAME ||= "test-bucket";
