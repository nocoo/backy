// Worker workspace global setup. Mirrors the api setup's net guard so that
// any handler invoked through `worker.fetch(...)` in tests can't accidentally
// reach the real internet.
//
// We don't need to stub node:dns/promises here: worker tests use fakeD1 +
// fakeR2 and never go through the SSRF lib/url path (only api/handlers/cron
// reaches it, and that's covered by api workspace tests where dns IS
// stubbed via setupFiles). Keeping this file minimal trims setup overhead.
import { beforeEach } from "vitest";

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
