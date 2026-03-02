import JSZip from "jszip";

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

/** Default stubs for `@/lib/db/projects`. */
export const PROJECT_STUBS = {
  getProject: async () => undefined,
  getProjectByToken: async () => undefined,
  listProjects: async () => [],
  createProject: async () => ({}),
  updateProject: async () => ({}),
  deleteProject: async () => {},
  regenerateToken: async () => undefined,
  listAutoBackupProjects: async () => [],
} as const;

/** Default stubs for `@/lib/db/backups`. */
export const BACKUP_STUBS = {
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
  getBackupFileKeys: async () => [],
  countBackups: async () => 0,
} as const;

/** Default stubs for `@/lib/r2/client`. */
export const R2_STUBS = {
  uploadToR2: async () => {},
  downloadFromR2: async () => ({
    body: null,
    contentType: "application/octet-stream",
    contentLength: 0,
  }),
  createPresignedDownloadUrl: async () => "https://mock.example.com/signed",
  deleteFromR2: async () => {},
  deleteMultipleFromR2: async () => 0,
  listR2Objects: async () => [],
  isR2Configured: () => true,
  pingR2: async () => {},
  resetR2Client: () => {},
} as const;
