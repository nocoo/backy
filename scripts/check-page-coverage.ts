/**
 * L3 page coverage gate.
 *
 * Statically extract every <Route path="..."> from apps/web/src/App.tsx,
 * then statically extract every page.goto() call from e2e/bdd/**.
 * Fail if any declared page has no matching BDD visit.
 *
 * Run: `bun run scripts/check-page-coverage.ts`
 */

import { readdirSync, readFileSync } from "node:fs";
import { resolve, join } from "node:path";

const ROOT = resolve(import.meta.dirname, "..");

// ---------------------------------------------------------------------------
// 1. Discover declared pages from App.tsx
// ---------------------------------------------------------------------------

function discoverPages(): string[] {
  const appPath = join(ROOT, "apps/web/src/App.tsx");
  const src = readFileSync(appPath, "utf-8");
  const pages: string[] = [];

  // Match <Route path="..." element={...} />
  const re = /<Route\s+path=["']([^"']+)["']\s+element=/g;
  for (const m of src.matchAll(re)) {
    const path = m[1];
    if (path && path !== "*") {
      pages.push(path);
    }
  }
  return pages;
}

// ---------------------------------------------------------------------------
// 2. Discover visited pages from e2e/bdd/
// ---------------------------------------------------------------------------

function discoverBDDVisits(): string[] {
  const bddDir = join(ROOT, "e2e/bdd");
  const files = readdirSync(bddDir).filter((f) => f.endsWith(".spec.ts"));
  const visits: string[] = [];

  for (const file of files) {
    const src = readFileSync(join(bddDir, file), "utf-8");

    // Match page.goto("/...") and page.goto(`/...`)
    const re = /page\.goto\(\s*[`"']([^`"']+)[`"']\s*\)/g;
    for (const m of src.matchAll(re)) {
      const path = m[1];
      if (path) visits.push(path);
    }

    // Match page.goto(`/projects/${...}`) — template literals with variables
    const templateRe = /page\.goto\(\s*`([^`]+)`\s*\)/g;
    for (const m of src.matchAll(templateRe)) {
      const rawPath = m[1];
      if (rawPath) visits.push(rawPath);
    }
  }
  return visits;
}

// ---------------------------------------------------------------------------
// 3. Match BDD visits against declared pages
// ---------------------------------------------------------------------------

function pageToRegex(path: string): RegExp {
  const escaped = path
    .split("/")
    .map((seg) => {
      if (seg.startsWith(":")) return "[^/]+";
      return seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    })
    .join("/");
  return new RegExp(`^${escaped}$`);
}

function normaliseVisitPath(path: string): string {
  // Replace template literal expressions like ${testProjectId} with a placeholder
  return path.replace(/\$\{[^}]+\}/g, "placeholder-id");
}

function isMatch(page: string, visit: string): boolean {
  const re = pageToRegex(page);
  return re.test(normaliseVisitPath(visit));
}

// ---------------------------------------------------------------------------
// 4. Main
// ---------------------------------------------------------------------------

function main(): void {
  console.log("=== L3 Page Coverage Gate ===\n");

  const pages = discoverPages();
  const visits = discoverBDDVisits();

  // Deduplicate visits
  const uniqueVisits = [...new Set(visits)];

  console.log(`Declared pages: ${pages.length}`);
  console.log(`BDD visits:     ${uniqueVisits.length}\n`);

  const uncovered: string[] = [];
  for (const page of pages) {
    const hit = uniqueVisits.some((v) => isMatch(page, v));
    if (!hit) uncovered.push(page);
  }

  if (uncovered.length === 0) {
    console.log(
      `✅ All ${pages.length} pages have at least one BDD visit.\n`,
    );
    return;
  }

  console.error(`❌ ${uncovered.length} page(s) have NO BDD coverage:\n`);
  for (const p of uncovered) {
    console.error(`  ${p}`);
  }
  console.error("\nAdd a page.goto() in e2e/bdd/ for each uncovered page.\n");
  process.exit(1);
}

main();
