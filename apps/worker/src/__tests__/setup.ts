// Worker workspace global setup. Mirrors the api setup's net guard so that
// any handler invoked through `worker.fetch(...)` in tests can't accidentally
// reach the real internet. (api setup is isolated to the api workspace.)
import { vi, beforeEach } from "vitest";

// Stub node:dns/promises here too, in case any worker-resident handler ever
// reaches into url-validation paths.
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
      return ["93.184.216.34"];
    },
    resolve6: async (host: string) => {
      if (host === "localhost") return ["::1"];
      if (host.endsWith(".example") || host.includes("does-not-exist"))
        NXDOMAIN(host);
      return ["2606:2800:220:1:248:1893:25c8:1946"];
    },
  };
});

const NET_GUARD = ((url: RequestInfo | URL) => {
  throw new Error(
    `[unit-test net guard] real fetch() call to ${String(url)} — ` +
      `worker tests must keep all network mocked / stubbed.`,
  );
}) as unknown as typeof fetch;
(NET_GUARD as typeof fetch & { preconnect: () => void }).preconnect = () => {};

beforeEach(() => {
  globalThis.fetch = NET_GUARD;
});
