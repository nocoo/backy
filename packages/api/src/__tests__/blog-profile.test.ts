import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  AUTHOR_PROFILE_CACHE_TTL_MS,
  AUTHOR_PROFILE_ENDPOINT,
  __resetAuthorProfileCacheForTests,
  emailSha256Hex,
  fetchAuthorProfile,
  isSha256Hex,
  lookupAuthorProfile,
  normalizeEmail,
} from "../lib/blog-profile";
import { mockFetch } from "./helpers";

const KNOWN_EMAIL = "architie@gmail.com";
const KNOWN_HASH =
  "7ba563171c26fb9b82e9f7750840c0455602eb35025192027230bcb40aae1217";
const AVATAR = "https://example.com/avatar-80.jpg";

function jsonRes(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  __resetAuthorProfileCacheForTests();
});

afterEach(() => {
  vi.useRealTimers();
});

describe("normalizeEmail", () => {
  test("trims and lowercases", () => {
    expect(normalizeEmail("  Architie@Gmail.com  ")).toBe(KNOWN_EMAIL);
  });
});

describe("emailSha256Hex", () => {
  test("matches the published author vector", async () => {
    expect(await emailSha256Hex(KNOWN_EMAIL)).toBe(KNOWN_HASH);
  });

  test("normalizes before hashing", async () => {
    expect(await emailSha256Hex("  Architie@Gmail.com\n")).toBe(KNOWN_HASH);
  });
});

describe("isSha256Hex", () => {
  test("accepts 64 lowercase hex chars", () => {
    expect(isSha256Hex(KNOWN_HASH)).toBe(true);
  });

  test("rejects uppercase, short, and empty values", () => {
    expect(isSha256Hex(KNOWN_HASH.toUpperCase())).toBe(false);
    expect(isSha256Hex("abc")).toBe(false);
    expect(isSha256Hex("")).toBe(false);
  });
});

describe("fetchAuthorProfile", () => {
  test("returns empty without fetching when hash is invalid", async () => {
    const fetcher = vi.fn(async () => jsonRes({ name: "nope" }));
    await expect(fetchAuthorProfile("nope", fetcher)).resolves.toEqual({
      name: null,
      avatar: null,
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  test("returns name and avatar on a hit and strips extra fields", async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toBe(`${AUTHOR_PROFILE_ENDPOINT}?hash=${KNOWN_HASH}`);
      return jsonRes({
        name: "Zheng Li",
        avatar: AVATAR,
        email: "secret@example.com",
        id: "hidden",
        slug: "zheng-li",
      });
    });
    await expect(fetchAuthorProfile(KNOWN_HASH, fetcher)).resolves.toEqual({
      name: "Zheng Li",
      avatar: AVATAR,
    });
  });

  test("returns nulls on a published miss", async () => {
    const fetcher = vi.fn(async () => jsonRes({ name: null, avatar: null }));
    await expect(fetchAuthorProfile(KNOWN_HASH, fetcher)).resolves.toEqual({
      name: null,
      avatar: null,
    });
  });

  test("treats empty strings as null", async () => {
    const fetcher = vi.fn(async () => jsonRes({ name: "", avatar: "" }));
    await expect(fetchAuthorProfile(KNOWN_HASH, fetcher)).resolves.toEqual({
      name: null,
      avatar: null,
    });
  });

  test("ignores non-string name/avatar and non-object bodies", async () => {
    await expect(
      fetchAuthorProfile(KNOWN_HASH, async () => jsonRes({ name: 1, avatar: {} })),
    ).resolves.toEqual({ name: null, avatar: null });
    __resetAuthorProfileCacheForTests();
    await expect(
      fetchAuthorProfile(KNOWN_HASH, async () => jsonRes(["Zheng Li"])),
    ).resolves.toEqual({ name: null, avatar: null });
    __resetAuthorProfileCacheForTests();
    await expect(
      fetchAuthorProfile(KNOWN_HASH, async () => jsonRes(null)),
    ).resolves.toEqual({ name: null, avatar: null });
  });

  test("returns empty on 429 without caching", async () => {
    let calls = 0;
    const fetcher = vi.fn(async () => {
      calls += 1;
      return jsonRes({ name: null, avatar: null }, 429);
    });
    await expect(fetchAuthorProfile(KNOWN_HASH, fetcher)).resolves.toEqual({
      name: null,
      avatar: null,
    });
    await expect(fetchAuthorProfile(KNOWN_HASH, fetcher)).resolves.toEqual({
      name: null,
      avatar: null,
    });
    expect(calls).toBe(2);
  });

  test("returns empty on fetch throw or invalid json", async () => {
    await expect(
      fetchAuthorProfile(KNOWN_HASH, async () => {
        throw new Error("net");
      }),
    ).resolves.toEqual({ name: null, avatar: null });
    await expect(
      fetchAuthorProfile(
        KNOWN_HASH,
        async () => new Response("{", { status: 200 }),
      ),
    ).resolves.toEqual({ name: null, avatar: null });
  });

  test("caches a 200 response until TTL expires", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-21T00:00:00Z"));
    const fetcher = vi.fn(async () =>
      jsonRes({ name: "Zheng Li", avatar: AVATAR }),
    );
    await fetchAuthorProfile(KNOWN_HASH, fetcher);
    await fetchAuthorProfile(KNOWN_HASH, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(1);

    vi.setSystemTime(
      new Date("2026-08-21T00:00:00Z").getTime() +
        AUTHOR_PROFILE_CACHE_TTL_MS +
        1,
    );
    await fetchAuthorProfile(KNOWN_HASH, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  test("uses global fetch when fetcher is omitted", async () => {
    globalThis.fetch = mockFetch(async (url) => {
      expect(String(url)).toBe(
        `${AUTHOR_PROFILE_ENDPOINT}?hash=${KNOWN_HASH}`,
      );
      return jsonRes({ name: "Zheng Li", avatar: AVATAR });
    });
    await expect(fetchAuthorProfile(KNOWN_HASH)).resolves.toEqual({
      name: "Zheng Li",
      avatar: AVATAR,
    });
  });
});

describe("lookupAuthorProfile", () => {
  test("hashes the email then fetches", async () => {
    const fetcher = vi.fn(async (url: string) => {
      expect(url).toContain(KNOWN_HASH);
      return jsonRes({ name: "Zheng Li", avatar: AVATAR });
    });
    await expect(
      lookupAuthorProfile("  Architie@Gmail.com  ", fetcher),
    ).resolves.toEqual({ name: "Zheng Li", avatar: AVATAR });
  });
});
