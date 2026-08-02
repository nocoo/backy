#!/usr/bin/env bun
/**
 * 扫描所有 vitest 单测文件，统计「弱测试」数量。
 *
 * 弱测试启发式（粗粒度，目标是趋势监控，不是精确判定）：
 *   1. it/test 块体内**没有任何 `expect(`** 调用
 *   2. 仅含 `expect(...).toBeDefined()` / `.toBeTruthy()` / `.not.toBeUndefined()`
 *      之类的「存在性断言」且没有别的 expect
 *   3. 仅断言对 mock 自身（`expect(mockFn).toHaveBeenCalled()` 等且没有
 *      其它 expect —— 表明只验证调用未验证副作用）
 *   4. `it.skip` / `test.skip` / `it.todo` / `test.todo` / `xit` / `xtest`
 *   5. 空体（仅注释或空 statement 列表）
 *
 * 输出 JSON：{ total, byFile: [...], byKind: {...} }
 *
 * 不会修改任何文件；只读扫描。
 */
import { readFileSync } from "node:fs";
import { globSync } from "node:fs";
import { resolve } from "node:path";

const ROOTS = [
  "apps/web/src/__tests__",
  "apps/worker/src/__tests__",
  "packages/api/src/__tests__",
  "apps/cli",
];

const files: string[] = [];
for (const root of ROOTS) {
  try {
    const matches = globSync("**/*.test.{ts,tsx}", { cwd: resolve(root) });
    for (const m of matches) files.push(resolve(root, m));
  } catch {
    /* skip missing root */
  }
}

type Kind =
  | "noExpect"
  | "trivialExistence"
  | "onlyMockCall"
  | "skipped"
  | "empty"
  | "vacuousTryCatch"
  | "vacuousKindNarrow";
const counts: Record<Kind, number> = {
  noExpect: 0,
  trivialExistence: 0,
  onlyMockCall: 0,
  skipped: 0,
  empty: 0,
  vacuousTryCatch: 0,
  vacuousKindNarrow: 0,
};
const byFile: Array<{ file: string; weak: number }> = [];

const TRIVIAL_RE = /\.(toBeDefined|toBeTruthy|not\.toBeUndefined|not\.toBeNull|toBeFalsy)\b/;
const MOCK_CALL_RE = /\.(toHaveBeenCalled|toHaveBeenCalledTimes|toHaveBeenCalledWith)\b/;
const ANY_EXPECT_RE = /\bexpect\s*\(/g;
// `expect(typeof X).toBe("function")` / `expect(X).toBe(<some module>)` etc.
// Specifically catches the "X is a function component" surface tests that
// only verify exports exist and resolve to a callable — no behavior asserted.
const SURFACE_TYPE_RE =
  /expect\s*\(\s*typeof\s+[\w.[\]]+\s*\)\s*\.toBe\s*\(\s*["'](function|object|string|number|boolean)["']\s*\)/;

function stripCommentsAndStrings(src: string): string {
  // Replace /* ... */, // ... \n, and string literals with spaces of the same
  // length so subsequent regex offsets still line up. This stops the
  // test/it scanner from matching English `test` / `it` inside comments
  // and "it works" / 'test passes'-style assertion-message strings.
  let out = "";
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    const next = src[i + 1];
    if (c === "/" && next === "/") {
      while (i < src.length && src[i] !== "\n") {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
    } else if (c === "/" && next === "*") {
      out += "  ";
      i += 2;
      while (i < src.length && !(src[i] === "*" && src[i + 1] === "/")) {
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < src.length) {
        out += "  ";
        i += 2;
      }
    } else if (c === "'" || c === '"' || c === "`") {
      const quote = c;
      out += quote;
      i++;
      while (i < src.length && src[i] !== quote) {
        if (src[i] === "\\") {
          out += "  ";
          i += 2;
          continue;
        }
        out += src[i] === "\n" ? "\n" : " ";
        i++;
      }
      if (i < src.length) {
        out += quote;
        i++;
      }
    } else {
      out += c;
      i++;
    }
  }
  return out;
}

// Match a single it/test block, capturing its body. We balance braces manually.
function* iterateCases(srcRaw: string): Generator<{
  header: string;
  body: string;
  isSkipped: boolean;
}> {
  // Strip comments + string contents first so the scanner doesn't match
  // English words like "test" / "it" appearing in comments / messages.
  const src = stripCommentsAndStrings(srcRaw);
  // Match "it(", "test(", "it.skip(", "it.only(", "it.todo(", "xit(", "xtest("
  const re = /(?<![\w.])(?:x?it|x?test)(?:\.(skip|only|todo|concurrent|sequential|each))?\s*\(/g;
  let m: RegExpExecArray | null = re.exec(src);
  while (m !== null) {
    const modifier = m[1] ?? "";
    const isSkipped = /^x/.test(m[0]) || modifier === "skip" || modifier === "todo";
    // .todo often has no body (just a string). Bail by scanning to next ).
    if (modifier === "todo") {
      counts.skipped++;
      yield { header: m[0], body: "", isSkipped: true };
      m = re.exec(src);
      continue;
    }
    // Find arrow/function body opening { after the args.
    // Skip the first arg (string title), then scan to the first `{` at top level of args.
    let i = m.index + m[0].length;
    // Walk balanced parens to find matching ')'
    let paren = 1;
    let bodyStart = -1;
    let inStr: string | null = null;
    while (i < src.length && paren > 0) {
      const c = src[i];
      if (inStr) {
        if (c === "\\") { i += 2; continue; }
        if (c === inStr) inStr = null;
      } else {
        if (c === "'" || c === '"' || c === "`") inStr = c;
        else if (c === "(") paren++;
        else if (c === ")") paren--;
        else if (c === "{" && paren === 1) {
          // first top-level { inside args = function body opening
          if (bodyStart === -1) bodyStart = i;
        }
      }
      i++;
    }
    if (bodyStart === -1) {
      // arrow w/o braces: () => expr  — treat whole arg as body
      yield { header: m[0], body: src.slice(m.index + m[0].length, i), isSkipped };
      re.lastIndex = i;
      m = re.exec(src);
      continue;
    }
    // bodyStart points to '{'. Find matching '}'.
    let bi = bodyStart + 1;
    let depth = 1;
    let bInStr: string | null = null;
    while (bi < src.length && depth > 0) {
      const c = src[bi];
      if (bInStr) {
        if (c === "\\") { bi += 2; continue; }
        if (c === bInStr) bInStr = null;
      } else {
        if (c === "'" || c === '"' || c === "`") bInStr = c;
        else if (c === "{") depth++;
        else if (c === "}") depth--;
      }
      bi++;
    }
    const body = src.slice(bodyStart + 1, bi - 1);
    yield { header: m[0], body, isSkipped };
    re.lastIndex = bi;
    m = re.exec(src);
  }
}

let total = 0;
const SHOW_BODIES = process.argv.includes("--debug");
for (const file of files) {
  let src: string;
  try {
    src = readFileSync(file, "utf8");
  } catch {
    continue;
  }
  let weakInFile = 0;
  for (const c of iterateCases(src)) {
    if (c.isSkipped) {
      total++;
      weakInFile++;
      continue;
    }
    const body = c.body.trim();
    if (body === "" || /^\s*(\/\/.*|\/\*[\s\S]*?\*\/)?\s*$/.test(body)) {
      counts.empty++;
      total++;
      weakInFile++;
      continue;
    }
    const expects = body.match(ANY_EXPECT_RE);
    if (!expects || expects.length === 0) {
      counts.noExpect++;
      total++;
      weakInFile++;
      if (SHOW_BODIES) console.error(`noExpect in ${file}\n--- BODY ---\n${body.slice(0, 300)}\n---`);
      continue;
    }
    // Check whether *every* expect line is a trivial existence/typeof matcher
    const expectLines = body.split(/\n/).filter((l) => /\bexpect\s*\(/.test(l));
    const allTrivial =
      expectLines.length > 0 &&
      expectLines.every(
        (l) =>
          (TRIVIAL_RE.test(l) || SURFACE_TYPE_RE.test(l)) &&
          !/\.(toEqual|toMatch|toContain|toThrow|toStrictEqual|toHaveProperty|toHaveLength)\b/.test(
            l,
          ) &&
          // toBe is fine *unless* it's the surface typeof pattern — handled above.
          !/\.toBe\s*\(/.test(l.replace(SURFACE_TYPE_RE, "")),
      );
    if (allTrivial) {
      counts.trivialExistence++;
      total++;
      weakInFile++;
      continue;
    }
    const allMockCalls =
      expectLines.length > 0 &&
      expectLines.every((l) => MOCK_CALL_RE.test(l)) &&
      !TRIVIAL_RE.test(body) &&
      !/\.(toBe|toEqual|toMatch|toContain|toStrictEqual|toHaveProperty|toHaveLength)\b/.test(body);
    if (allMockCalls) {
      counts.onlyMockCall++;
      total++;
      weakInFile++;
      continue;
    }
    // Vacuous try/catch: every expect() inside the catch block, AND no
    // 'throw' / 'should have thrown' / 'expect.fail' / `await expect(...)
    // .rejects` guard before the catch. Such a test silently passes if the
    // tested code resolves instead of rejecting.
    if (/\btry\s*\{/.test(body)) {
      const tryBlockMatch = body.match(/\btry\s*\{([\s\S]*?)\}\s*catch/);
      const catchBlockMatch = body.match(/\bcatch\s*\([^)]*\)\s*\{([\s\S]*?)\}/);
      const tryBody = tryBlockMatch?.[1] ?? "";
      const catchBody = catchBlockMatch?.[1] ?? "";
      const tryHasGuard =
        /\bthrow\s+/.test(tryBody) ||
        /should have thrown/i.test(tryBody) ||
        /expect\.fail/.test(tryBody);
      const catchHasExpect = /\bexpect\s*\(/.test(catchBody);
      const tryHasExpectRejects = /\bawait\s+expect\s*\([^)]*\)\s*\.rejects/.test(
        tryBody,
      );
      if (catchHasExpect && !tryHasGuard && !tryHasExpectRejects) {
        counts.vacuousTryCatch++;
        total++;
        weakInFile++;
        continue;
      }
    }
    // Vacuous union-narrow guard: `if (r.kind === "json") { expect(...) }`
    // (or `if (r.kind === "json") expect(...)`) silently passes when the
    // impl drifts to a different kind. Flag if the body contains such an
    // `if`, the if-controlled region has expects, and there's no preceding
    // `expect(<same>.kind)` assertion outside the if.
    const kindIfRe =
      /\bif\s*\(\s*([\w$.]+)\.kind\s*===\s*["'][^"']+["']\s*\)/g;
    let kindMatch: RegExpExecArray | null = kindIfRe.exec(body);
    let foundVacuousKind = false;
    while (kindMatch !== null) {
      const subject = kindMatch[1];
      const before = body.slice(0, kindMatch.index);
      // Region starting at the if. Cheap heuristic: take next ~400 chars,
      // good enough for typical handler tests where bodies are short.
      const after = body.slice(kindMatch.index, kindMatch.index + 600);
      const ifHasExpect = /\bexpect\s*\(/.test(after);
      const guardRe = new RegExp(
        `\\bexpect\\s*\\(\\s*${subject.replace(/[.$]/g, "\\$&")}\\.kind\\s*\\)`,
      );
      const beforeHasGuard = guardRe.test(before);
      if (ifHasExpect && !beforeHasGuard) {
        foundVacuousKind = true;
        break;
      }
      kindMatch = kindIfRe.exec(body);
    }
    if (foundVacuousKind) {
      counts.vacuousKindNarrow++;
      total++;
      weakInFile++;
    }
  }
  if (weakInFile > 0) byFile.push({ file, weak: weakInFile });
}

byFile.sort((a, b) => b.weak - a.weak);
const out = { total, byKind: counts, byFile: byFile.slice(0, 30) };
if (process.argv.includes("--json")) {
  console.log(JSON.stringify(out, null, 2));
} else {
  console.log(`weak_tests=${total}`);
  for (const [k, v] of Object.entries(counts)) console.log(`  ${k}=${v}`);
  console.log("top files:");
  for (const f of out.byFile.slice(0, 10)) console.log(`  ${f.weak}\t${f.file}`);
}
