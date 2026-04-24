/**
 * E2E API test runner — executes the API suites against the real route
 * modules in-process. This avoids binding a local port, which is blocked
 * in the current sandbox, while still exercising the same handlers,
 * runtime wiring and route adapters.
 */

import { Database } from "bun:sqlite";
import { nodeRuntimeInfo, type BackyEnv, type RuntimeContext } from "@backy/api/runtime";
import { runE2ETests } from "../e2e/api/runner";
import { seedTestProject } from "../e2e/api/config";
import { setTestCtxOverride } from "../src/lib/runtime";

const E2E_PORT = 17017;
const E2E_BASE_URL = `http://localhost:${E2E_PORT}`;

type RouteParams = { params: Promise<Record<string, string>> };

type StoredObject = {
  bytes: Uint8Array;
  contentType: string;
};

function createInMemoryCtx(): {
  ctx: RuntimeContext;
  objects: Map<string, StoredObject>;
  close: () => void;
} {
  const sqlite = new Database(":memory:");
  sqlite.exec("PRAGMA foreign_keys = ON");
  const objects = new Map<string, StoredObject>();
  const env: BackyEnv = {
    CRON_SECRET: process.env.CRON_SECRET || "e2e-cron-secret-backy-2026",
    ALLOWED_HOSTS: `localhost:${E2E_PORT}`,
    SSRF_ALLOWLIST: E2E_BASE_URL,
    E2E_SKIP_AUTH: "true",
    NEXT_PUBLIC_APP_VERSION: "test",
  };

  const ctx: RuntimeContext = {
    db: {
      async query<T>(sql: string, params: unknown[] = []) {
        const stmt = sqlite.query(sql);
        const upper = sql.trim().toUpperCase();
        if (
          upper.startsWith("SELECT") ||
          upper.startsWith("WITH") ||
          upper.startsWith("PRAGMA")
        ) {
          return { results: stmt.all(...(params as never[])) as T[] };
        }
        const result = stmt.run(...(params as never[]));
        return {
          results: [] as T[],
          meta: {
            changes: result.changes,
            last_row_id: Number(result.lastInsertRowid),
          },
        };
      },
    },
    r2: {
      async put(key, body, opts) {
        let bytes: Uint8Array;
        if (body instanceof Uint8Array) {
          bytes = body;
        } else if (body instanceof Buffer) {
          bytes = new Uint8Array(body);
        } else if (body instanceof ArrayBuffer) {
          bytes = new Uint8Array(body);
        } else {
          bytes = await new Response(body as ReadableStream).bytes();
        }
        objects.set(key, {
          bytes,
          contentType: opts?.contentType ?? "application/octet-stream",
        });
      },
      async get(key) {
        const stored = objects.get(key);
        if (!stored) return null;
        return {
          body: new Response(stored.bytes).body,
          bytes: async () => stored.bytes,
          contentType: stored.contentType,
          contentLength: stored.bytes.byteLength,
        };
      },
      async delete(key) {
        objects.delete(key);
      },
      async presignDownload(key) {
        return `${E2E_BASE_URL}/__r2/${encodeURIComponent(key)}`;
      },
      async ping() {},
    },
    env,
    info: nodeRuntimeInfo(),
  };

  return {
    ctx,
    objects,
    close: () => sqlite.close(),
  };
}

function getUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.toString();
  return input.url;
}

function makeRequest(input: RequestInfo | URL, init?: RequestInit): Request {
  if (input instanceof Request && init === undefined) return input;
  return new Request(getUrl(input), init);
}

function decodeRouteParam(
  match: RegExpMatchArray,
  index: number,
  route: string,
): string {
  const value = match[index];
  if (value === undefined) {
    throw new Error(`Missing route param ${index} for ${route}`);
  }
  return decodeURIComponent(value);
}

async function dispatchApiRequest(
  request: Request,
  objects: Map<string, StoredObject>,
): Promise<Response> {
  const url = new URL(request.url);
  const path = url.pathname;
  const method = request.method.toUpperCase();

  if (path.startsWith("/__r2/") && method === "GET") {
    const key = decodeURIComponent(path.slice("/__r2/".length));
    const stored = objects.get(key);
    if (!stored) {
      return new Response("Not Found", { status: 404 });
    }
    return new Response(stored.bytes, {
      status: 200,
      headers: { "content-type": stored.contentType },
    });
  }

  if (path === "/api/live" && method === "GET") {
    const { GET } = await import("../src/app/api/live/route");
    return GET();
  }
  if (path === "/api/stats" && method === "GET") {
    const { GET } = await import("../src/app/api/stats/route");
    return GET();
  }
  if (path === "/api/stats/charts" && method === "GET") {
    const { GET } = await import("../src/app/api/stats/charts/route");
    return GET();
  }
  if (path === "/api/db/init" && method === "POST") {
    const { POST } = await import("../src/app/api/db/init/route");
    return POST();
  }
  if (path === "/api/db/seed-test-project" && method === "POST") {
    const { POST } = await import("../src/app/api/db/seed-test-project/route");
    return POST();
  }
  if (path === "/api/backups" && method === "GET") {
    const { GET } = await import("../src/app/api/backups/route");
    return GET(request);
  }
  if (path === "/api/backups" && method === "DELETE") {
    const { DELETE } = await import("../src/app/api/backups/route");
    return DELETE(request);
  }
  if (path === "/api/backups/upload" && method === "POST") {
    const { POST } = await import("../src/app/api/backups/upload/route");
    return POST(request);
  }
  if (path === "/api/categories" && method === "GET") {
    const { GET } = await import("../src/app/api/categories/route");
    return GET();
  }
  if (path === "/api/categories" && method === "POST") {
    const { POST } = await import("../src/app/api/categories/route");
    return POST(request);
  }
  if (path === "/api/projects" && method === "GET") {
    const { GET } = await import("../src/app/api/projects/route");
    return GET();
  }
  if (path === "/api/projects" && method === "POST") {
    const { POST } = await import("../src/app/api/projects/route");
    return POST(request);
  }
  if (path === "/api/logs" && method === "GET") {
    const { GET } = await import("../src/app/api/logs/route");
    return GET(request);
  }
  if (path === "/api/logs" && method === "DELETE") {
    const { DELETE } = await import("../src/app/api/logs/route");
    return DELETE(request);
  }
  if (path === "/api/cron/trigger" && method === "POST") {
    const { POST } = await import("../src/app/api/cron/trigger/route");
    return POST(request);
  }
  if (path === "/api/cron/logs" && method === "GET") {
    const { GET } = await import("../src/app/api/cron/logs/route");
    return GET(request);
  }
  if (path === "/api/cron/logs" && method === "DELETE") {
    const { DELETE } = await import("../src/app/api/cron/logs/route");
    return DELETE(request);
  }

  let match = path.match(/^\/api\/webhook\/([^/]+)$/);
  if (match) {
    const { HEAD, GET, POST } = await import("../src/app/api/webhook/[projectId]/route");
    const params: RouteParams = {
      params: Promise.resolve({
        projectId: decodeRouteParam(match, 1, "/api/webhook/[projectId]"),
      }),
    };
    if (method === "HEAD") return HEAD(request, params);
    if (method === "GET") return GET(request, params);
    if (method === "POST") return POST(request, params);
  }

  match = path.match(/^\/api\/backups\/([^/]+)$/);
  if (match) {
    const { GET, DELETE } = await import("../src/app/api/backups/[id]/route");
    const params: RouteParams = {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/backups/[id]"),
      }),
    };
    if (method === "GET") return GET(request, params);
    if (method === "DELETE") return DELETE(request, params);
  }

  match = path.match(/^\/api\/backups\/([^/]+)\/preview$/);
  if (match && method === "GET") {
    const { GET } = await import("../src/app/api/backups/[id]/preview/route");
    return GET(request, {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/backups/[id]/preview"),
      }),
    });
  }

  match = path.match(/^\/api\/backups\/([^/]+)\/download$/);
  if (match && method === "GET") {
    const { GET } = await import("../src/app/api/backups/[id]/download/route");
    return GET(request, {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/backups/[id]/download"),
      }),
    });
  }

  match = path.match(/^\/api\/backups\/([^/]+)\/extract$/);
  if (match && method === "POST") {
    const { POST } = await import("../src/app/api/backups/[id]/extract/route");
    return POST(request, {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/backups/[id]/extract"),
      }),
    });
  }

  match = path.match(/^\/api\/restore\/([^/]+)$/);
  if (match && method === "GET") {
    const { GET } = await import("../src/app/api/restore/[id]/route");
    return GET(request, {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/restore/[id]"),
      }),
    });
  }

  match = path.match(/^\/api\/categories\/([^/]+)$/);
  if (match) {
    const { GET, PUT, DELETE } = await import("../src/app/api/categories/[id]/route");
    const params: RouteParams = {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/categories/[id]"),
      }),
    };
    if (method === "GET") return GET(request, params);
    if (method === "PUT") return PUT(request, params);
    if (method === "DELETE") return DELETE(request, params);
  }

  match = path.match(/^\/api\/projects\/([^/]+)$/);
  if (match) {
    const { GET, PUT, DELETE } = await import("../src/app/api/projects/[id]/route");
    const params: RouteParams = {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/projects/[id]"),
      }),
    };
    if (method === "GET") return GET(request, params);
    if (method === "PUT") return PUT(request, params);
    if (method === "DELETE") return DELETE(request, params);
  }

  match = path.match(/^\/api\/projects\/([^/]+)\/token$/);
  if (match && method === "POST") {
    const { POST } = await import("../src/app/api/projects/[id]/token/route");
    return POST(request, {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/projects/[id]/token"),
      }),
    });
  }

  match = path.match(/^\/api\/projects\/([^/]+)\/prompt$/);
  if (match && method === "GET") {
    const { GET } = await import("../src/app/api/projects/[id]/prompt/route");
    return GET(request, {
      params: Promise.resolve({
        id: decodeRouteParam(match, 1, "/api/projects/[id]/prompt"),
      }),
    });
  }

  throw new Error(`Unhandled local API route: ${method} ${path}`);
}

async function withLocalApiFetch<T>(fn: () => Promise<T>): Promise<T> {
  const originalFetch = globalThis.fetch;
  const originalCronSecret = process.env.CRON_SECRET;
  const runtime = createInMemoryCtx();

  process.env.CRON_SECRET = runtime.ctx.env.CRON_SECRET;
  setTestCtxOverride(runtime.ctx);

  globalThis.fetch = (async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = getUrl(input);
    if (url.startsWith(E2E_BASE_URL)) {
      return dispatchApiRequest(makeRequest(input, init), runtime.objects);
    }
    return originalFetch(input, init);
  }) as typeof globalThis.fetch;
  globalThis.fetch.preconnect = originalFetch.preconnect;

  try {
    return await fn();
  } finally {
    globalThis.fetch = originalFetch;
    setTestCtxOverride(null);
    runtime.close();
    if (originalCronSecret === undefined) delete process.env.CRON_SECRET;
    else process.env.CRON_SECRET = originalCronSecret;
  }
}

async function main() {
  try {
    const { passed, failed, total } = await withLocalApiFetch(async () => {
      console.log("🚀 Running API E2E suite in-process");
      console.log("🗄️  Initializing test database schema...");
      const initRes = await fetch(`${E2E_BASE_URL}/api/db/init`, {
        method: "POST",
      });
      if (!initRes.ok) {
        const err = await initRes.text();
        throw new Error(`Schema init failed (${initRes.status}): ${err}`);
      }
      console.log("🌱 Seeding test project...");
      await seedTestProject(E2E_BASE_URL);
      console.log("");
      return runE2ETests(E2E_BASE_URL);
    });

    console.log("\n" + "=".repeat(60));
    console.log(`E2E Results: ${passed}/${total} passed, ${failed} failed`);
    console.log("=".repeat(60));

    if (failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("\n❌ E2E runner error:", error);
    process.exitCode = 1;
  }
}

main();
