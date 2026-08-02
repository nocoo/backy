import JSZip from "jszip";
import type {
  BackyEnv,
  D1Adapter,
  R2Adapter,
  RuntimeContext,
  RuntimeInfo,
} from "../runtime";

// ---------------------------------------------------------------------------
// Fetch mock
// ---------------------------------------------------------------------------

/**
 * Create a mock fetch that satisfies Bun's `typeof globalThis.fetch`
 * (requires a `.preconnect` property).
 */
export function mockFetch(
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>,
): typeof globalThis.fetch {
  const fn = handler as typeof globalThis.fetch;
  fn.preconnect = () => {};
  return fn;
}

// ---------------------------------------------------------------------------
// D1 response builders
// ---------------------------------------------------------------------------

/** Create a successful D1 HTTP API response. */
export function d1Success<T>(results: T[] = []) {
  return new Response(
    JSON.stringify({
      success: true,
      result: [{ results, success: true, meta: { changes: 0, last_row_id: 0 } }],
      errors: [],
    }),
    { status: 200 },
  );
}

/** Create a failed D1 HTTP API response. */
export function d1Error(message: string) {
  return new Response(
    JSON.stringify({
      success: false,
      result: [],
      errors: [{ message }],
    }),
    { status: 200 },
  );
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

/** Create a zip buffer from a map of filename → content. */
export async function createZipBuffer(
  files: Record<string, string>,
): Promise<Uint8Array> {
  const zip = new JSZip();
  for (const [name, content] of Object.entries(files)) {
    zip.file(name, content);
  }
  return zip.generateAsync({ type: "uint8array" });
}

/** Build a mock project record with sensible defaults. */
export function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "proj-test",
    name: "Test Project",
    description: null,
    webhook_token: "tok-abc",
    allowed_ips: null,
    category_id: null,
    auto_backup_enabled: 1,
    auto_backup_interval: 1,
    auto_backup_webhook: "https://saas.example.com/trigger-backup",
    auto_backup_header_key: null,
    auto_backup_header_value: null,
    created_at: "2026-01-01T00:00:00.000Z",
    updated_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// Default mock.module stubs
//
// Bun's mock.module is global — every mock MUST re-export ALL named exports,
// or other test files importing the same module will break. Spread these
// defaults and override only the functions your test cares about.
// ---------------------------------------------------------------------------

type Stub = Record<string, ((...args: any[]) => any) | object>;

/** Default stubs for `@backy/api/db/projects`. */
export const PROJECT_STUBS: Stub = {
  getProject: async () => undefined,
  getProjectByToken: async () => undefined,
  listProjects: async () => [],
  createProject: async () => ({}),
  updateProject: async () => ({}),
  deleteProject: async () => {},
  regenerateToken: async () => undefined,
  listAutoBackupProjects: async () => [],
};

/** Default stubs for `@backy/api/db/backups`. */
export const BACKUP_STUBS: Stub = {
  getBackup: async () => undefined,
  createBackup: async () => ({}),
  listBackups: async () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 20,
    totalPages: 0,
  }),
  listEnvironments: async () => [],
  deleteBackups: async () => [],
  deleteBackup: async () => undefined,
  updateBackup: async () => undefined,
  countBackups: async () => 0,
};

/** Default stubs for `@backy/api/r2`. */
export const R2_STUBS: Stub = {
  uploadToR2: async () => {},
  downloadFromR2: async () => ({
    body: null,
    contentType: "application/octet-stream",
    contentLength: 0,
  }),
  createPresignedDownloadUrl: async () => "https://mock.example.com/signed",
  deleteFromR2: async () => {},
  isR2Configured: () => true,
  pingR2: async () => {},
};

/** Default stubs for `@backy/api/db/webhook-logs`. */
export const WEBHOOK_LOG_STUBS: Stub = {
  createWebhookLog: async () => {},
  listWebhookLogs: async () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
  }),
  deleteWebhookLogs: async () => {},
};

/** Default stubs for `@backy/api/db/cron-logs`. */
export const CRON_LOG_STUBS: Stub = {
  createCronLog: async () => {},
  listCronLogs: async () => ({
    items: [],
    total: 0,
    page: 1,
    pageSize: 50,
    totalPages: 0,
  }),
  deleteCronLogs: async () => {},
};

/** Default stubs for `@backy/api/db/schema`. */
export const SCHEMA_STUBS: Stub = {
  initializeSchema: async () => {},
};

// ---------------------------------------------------------------------------
// Backup fixture builder
// ---------------------------------------------------------------------------

/** Build a mock backup record with sensible defaults. */
export function makeBackup(overrides: Record<string, unknown> = {}) {
  return {
    id: "bk-test",
    project_id: "proj-test",
    project_name: "Test Project",
    file_key: "backups/proj-test/bk-test.zip",
    json_key: null,
    file_size: 1024,
    is_single_json: 0,
    environment: "prod",
    tag: null,
    created_at: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// RuntimeContext test fixtures
// ---------------------------------------------------------------------------

export interface MockD1 extends D1Adapter {
  calls: Array<{ sql: string; params: unknown[] }>;
}

/**
 * D1 adapter that records every call. Supply a `respond` function to
 * customize the result; defaults to an empty result set.
 */
export function makeMockD1(
  respond: (sql: string, params: unknown[]) =>
    | { results: unknown[]; meta?: { changes?: number; last_row_id?: number } }
    | Promise<{ results: unknown[]; meta?: { changes?: number; last_row_id?: number } }>
    = () => ({ results: [] }),
): MockD1 {
  const calls: Array<{ sql: string; params: unknown[] }> = [];
  const adapter: MockD1 = {
    calls,
    async query<T>(sql: string, params: unknown[] = []) {
      calls.push({ sql, params });
      const r = await respond(sql, params);
      return {
        results: r.results as T[],
        ...(r.meta !== undefined && { meta: r.meta }),
      };
    },
  };
  return adapter;
}

export interface MockR2 extends R2Adapter {
  puts: Array<{ key: string; body: unknown; opts?: { contentType?: string } }>;
  deletes: string[];
  presigns: string[];
  pings: number;
}

/** R2 adapter that records every call. */
export function makeMockR2(
  overrides: Partial<R2Adapter> = {},
): MockR2 {
  const puts: MockR2["puts"] = [];
  const deletes: string[] = [];
  const presigns: string[] = [];
  let pings = 0;
  const adapter: MockR2 = {
    puts, deletes, presigns,
    get pings() { return pings; },
    set pings(v) { pings = v; },
    async put(key, body, opts) {
      puts.push({ key, body, ...(opts ? { opts } : {}) });
      if (overrides.put) await overrides.put(key, body, opts);
    },
    async get(key) {
      if (overrides.get) return overrides.get(key);
      return null;
    },
    async delete(key) {
      deletes.push(key);
      if (overrides.delete) await overrides.delete(key);
    },
    async presignDownload(key, ttl) {
      presigns.push(key);
      if (overrides.presignDownload) return overrides.presignDownload(key, ttl);
      return `https://mock.example.com/signed/${encodeURIComponent(key)}`;
    },
    async ping() {
      pings++;
      if (overrides.ping) await overrides.ping();
    },
  };
  return adapter;
}

/** Minimal RuntimeInfo that returns a fixed uptime. */
export function makeMockInfo(uptime: number | null = 42): RuntimeInfo {
  return { uptimeSeconds: () => uptime };
}

/** Build a complete RuntimeContext for handler tests. */
export function makeMockCtx(
  overrides: {
    db?: D1Adapter;
    r2?: R2Adapter;
    env?: Partial<BackyEnv>;
    info?: RuntimeInfo;
  } = {},
): RuntimeContext {
  return {
    db: overrides.db ?? makeMockD1(),
    r2: overrides.r2 ?? makeMockR2(),
    env: {
      D1_ACCOUNT_ID: "test-account",
      D1_DATABASE_ID: "test-db",
      D1_API_TOKEN: "test-token",
      R2_ACCOUNT_ID: "test-account",
      R2_ACCESS_KEY_ID: "test-key",
      R2_SECRET_ACCESS_KEY: "test-secret",
      R2_BUCKET_NAME: "test-bucket",
      ECHO_API_URL: "https://echo.example.com",
      ECHO_API_KEY: "test-echo-key",
      ALLOWED_HOSTS: "localhost:7017",
      ...overrides.env,
    },
    info: overrides.info ?? makeMockInfo(),
  };
}
