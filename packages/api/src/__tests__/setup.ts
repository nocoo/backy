// Vitest global setup. Loaded before any test file imports run.
//
// node:dns/promises is stubbed here (not in url.test.ts) because with
// `isolate: false` the module cache is shared across test files; if any
// sibling file imports `@backy/api/url` (and transitively node:dns)
// BEFORE url.test.ts runs, the real DNS module is cached and a per-file
// vi.mock can no longer intercept it. Pinning the stub at the suite level
// guarantees deterministic, network-free DNS resolution for every test.
import { vi } from "vitest";

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
