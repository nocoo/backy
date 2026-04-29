// Vitest global setup. Loaded before any test file imports run.
//
// node:dns/promises is stubbed here (not in url.test.ts) because with
// `isolate: false` the module cache is shared across test files; if any
// sibling file imports `@backy/api/url` (and transitively node:dns)
// BEFORE url.test.ts runs, the real DNS module is cached and a per-file
// vi.mock can no longer intercept it. Pinning the stub at the suite level
// guarantees deterministic, network-free DNS resolution for every test.
import { vi, beforeEach } from "vitest";

vi.mock("node:dns/promises", () => {
  const NXDOMAIN = (host: string) => {
    const e = new Error(`getaddrinfo ENOTFOUND ${host}`);
    (e as Error & { code: string }).code = "ENOTFOUND";
    throw e;
  };
  return {
    resolve4: async (host: string) => {
      if (host === "localhost") return ["127.0.0.1"];
      if (host.endsWith(".example") || host.includes("does-not-exist"))
        NXDOMAIN(host);
      return ["93.184.216.34"]; // example.com public IP
    },
    resolve6: async (host: string) => {
      if (host === "localhost") return ["::1"];
      if (host.endsWith(".example") || host.includes("does-not-exist"))
        NXDOMAIN(host);
      return ["2606:2800:220:1:248:1893:25c8:1946"];
    },
  };
});

// Defensive net guard: replace globalThis.fetch with a loud-failing stub
// before every test. Tests that legitimately need fetch must override
// `globalThis.fetch` themselves (handler tests already do this with
// `mockFetch` / direct stubs). Without this guard, an accidentally
// un-mocked code path could escape onto the real network and silently
// add latency / flake / cost to the suite.
const NET_GUARD = ((url: RequestInfo | URL) => {
  throw new Error(
    `[unit-test net guard] real fetch() call to ${String(url)} — ` +
      `every handler under test must inject its own fetcher or mock ` +
      `globalThis.fetch in beforeEach.`,
  );
}) as unknown as typeof fetch;
(NET_GUARD as typeof fetch & { preconnect: () => void }).preconnect = () => {};

beforeEach(() => {
  globalThis.fetch = NET_GUARD;
});
