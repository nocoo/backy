/**
 * L2 route coverage gate.
 *
 * Statically extract every `(method, path)` declared in apps/worker/src/index.ts +
 * apps/worker/src/routes/**, then statically extract every HTTP request made from
 * e2e/api/**. Fail if any declared route is not exercised by at least one
 * E2E test.
 *
 * This is a **structural** gate, not behavioural — it only verifies that the
 * route is hit at all. Per-route assertion quality is still the test author's
 * job. But it catches the "we added a new endpoint and forgot to E2E it" miss.
 *
 * Run: `bun run scripts/check-route-coverage.ts`
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");
const WORKER_SRC = join(ROOT, "apps/worker/src");

type RouteMethod = "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "HEAD";
type Route = { method: RouteMethod; path: string };

// ---------------------------------------------------------------------------
// 1. Discover declared routes
// ---------------------------------------------------------------------------

function loadMountPrefixes(): Map<string, string> {
  const indexPath = join(WORKER_SRC, "index.ts");
  const src = readFileSync(indexPath, "utf-8");
  const prefixes = new Map<string, string>();

  // Match app.route("/api/projects", projectsRoutes)
  const re = /app\.route\(\s*["']([^"']+)["']\s*,\s*(\w+)\s*\)/g;
  for (const m of src.matchAll(re)) {
    const prefix = m[1];
    const varName = m[2];
    if (prefix && varName) {
      // Map the imported variable name to its file
      // e.g., projectsRoutes -> projects, categoriesRoutes -> categories
      const routeFile = varName.replace(/Routes$/, "").toLowerCase();
      prefixes.set(routeFile, prefix);
    }
  }
  return prefixes;
}

function discoverDirectRoutes(): Route[] {
  const indexPath = join(WORKER_SRC, "index.ts");
  const src = readFileSync(indexPath, "utf-8");
  const routes: Route[] = [];
  const re = /\bapp\.(get|post|put|delete|patch|head)\(\s*["']([^"']+)["']/g;
  for (const m of src.matchAll(re)) {
    const method = m[1];
    const path = m[2];
    if (method && path) {
      routes.push({ method: method.toUpperCase() as RouteMethod, path });
    }
  }
  return routes;
}

function discoverSubRoutes(prefixes: Map<string, string>): Route[] {
  const routesDir = join(WORKER_SRC, "routes");
  const files = readdirSync(routesDir).filter((f) => f.endsWith(".ts"));
  const routes: Route[] = [];

  for (const file of files) {
    const src = readFileSync(join(routesDir, file), "utf-8");
    // Get prefix from file name (e.g., projects.ts -> projects)
    const routeKey = file.replace(/\.ts$/, "").replace(/-/g, "");
    const prefix = prefixes.get(routeKey);
    if (!prefix) continue;

    // Match app.get("/", ...), app.post("/:id", ...), etc.
    const re = /\bapp\.(get|post|put|delete|patch|head)\(\s*["']([^"']*)["']/g;
    for (const m of src.matchAll(re)) {
      const method = m[1];
      const localPath = m[2];
      if (!method || localPath === undefined) continue;
      const fullPath = localPath === "/" ? prefix : `${prefix}${localPath}`;
      routes.push({
        method: method.toUpperCase() as RouteMethod,
        path: fullPath,
      });
    }

    // Match app.on("HEAD", "/:id", ...) for Hono's explicit method binding
    const onRe = /\bapp\.on\(\s*["'](GET|POST|PUT|DELETE|PATCH|HEAD)["']\s*,\s*["']([^"']*)["']/g;
    for (const m of src.matchAll(onRe)) {
      const method = m[1];
      const localPath = m[2];
      if (!method || localPath === undefined) continue;
      const fullPath = localPath === "/" ? prefix : `${prefix}${localPath}`;
      routes.push({
        method: method.toUpperCase() as RouteMethod,
        path: fullPath,
      });
    }
  }
  return routes;
}

// ---------------------------------------------------------------------------
// 2. Discover exercised routes from e2e/api/
// ---------------------------------------------------------------------------

function discoverE2ERequests(): Route[] {
  const e2eDir = join(ROOT, "e2e/api");
  const files = readdirSync(e2eDir).filter((f) => f.endsWith(".ts"));
  const requests: Route[] = [];

  for (const file of files) {
    const src = readFileSync(join(e2eDir, file), "utf-8");

    // url("/api/...") helper calls
    const urlHelperRe = /url\(\s*[`"']([^`"']+)[`"']\s*\)/g;
    for (const m of src.matchAll(urlHelperRe)) {
      const rawPath = m[1];
      if (!rawPath || !rawPath.startsWith("/api/")) continue;
      // Need to find the method from context — check nearby fetch/jsonRequest
      requests.push({ method: "GET", path: rawPath });
    }

    // jsonRequest("POST", "/api/...", ...) calls
    const jsonReqRe =
      /jsonRequest\(\s*["'](\w+)["']\s*,\s*[`"']([^`"']+)[`"']/g;
    for (const m of src.matchAll(jsonReqRe)) {
      const method = m[1];
      const rawPath = m[2];
      if (!method || !rawPath) continue;
      if (!rawPath.startsWith("/api/")) continue;
      requests.push({ method: method.toUpperCase() as RouteMethod, path: rawPath });
    }

    // Raw fetch(url("/api/..."), { method: "..." }) — extract method + path
    const fetchRe =
      /fetch\(\s*url\(\s*[`"']([^`"']+)[`"']\s*\)[^)]*?\{[^}]*?method:\s*["'](\w+)["']/gs;
    for (const m of src.matchAll(fetchRe)) {
      const rawPath = m[1];
      const method = m[2];
      if (!rawPath || !method) continue;
      if (!rawPath.startsWith("/api/")) continue;
      requests.push({ method: method.toUpperCase() as RouteMethod, path: rawPath });
    }

    // fetch(url(...)) with method inline or default GET
    const fetchSimpleRe =
      /fetch\(\s*url\(\s*[`"']([^`"']+)[`"']\s*\)\s*\)/g;
    for (const m of src.matchAll(fetchSimpleRe)) {
      const rawPath = m[1];
      if (!rawPath || !rawPath.startsWith("/api/")) continue;
      requests.push({ method: "GET", path: rawPath });
    }

    // fetch(url(...), { method: "..." }) without inline
    const fetchMethodRe =
      /fetch\(\s*url\(\s*[`"']([^`"']+)[`"']\s*\)\s*,\s*\{[^}]*?method:\s*["'](\w+)["']/gs;
    for (const m of src.matchAll(fetchMethodRe)) {
      const rawPath = m[1];
      const method = m[2];
      if (!rawPath || !method) continue;
      if (!rawPath.startsWith("/api/")) continue;
      requests.push({ method: method.toUpperCase() as RouteMethod, path: rawPath });
    }
  }
  return requests;
}

// ---------------------------------------------------------------------------
// 3. Match E2E requests against declared routes
// ---------------------------------------------------------------------------

function routeToRegex(path: string): RegExp {
  const escaped = path
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

function normaliseRequestPath(path: string): string {
  return path.replace(/\$\{[^}]+\}/g, "x");
}

function isMatch(route: Route, request: Route): boolean {
  const methodOk =
    route.method === request.method ||
    (route.method === "GET" && request.method === "HEAD");
  if (!methodOk) return false;
  const re = routeToRegex(route.path);
  return re.test(normaliseRequestPath(request.path));
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("=== L2 Route Coverage Gate ===\n");

  const prefixes = loadMountPrefixes();
  const declared = [...discoverDirectRoutes(), ...discoverSubRoutes(prefixes)];
  const requests = discoverE2ERequests();

  console.log(`Declared routes: ${declared.length}`);
  console.log(`E2E requests:    ${requests.length}\n`);

  const uncovered: Route[] = [];
  for (const route of declared) {
    const hit = requests.some((req) => isMatch(route, req));
    if (!hit) uncovered.push(route);
  }

  if (uncovered.length === 0) {
    console.log(
      `✅ All ${declared.length} routes have at least one E2E request.\n`,
    );
    return;
  }

  console.error(`❌ ${uncovered.length} route(s) have NO E2E coverage:\n`);
  for (const r of uncovered) {
    console.error(`  ${r.method.padEnd(6)} ${r.path}`);
  }
  console.error("\nAdd a request in e2e/api/ for each uncovered route.\n");
  process.exit(1);
}

main();
