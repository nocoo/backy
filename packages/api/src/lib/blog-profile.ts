export const AUTHOR_PROFILE_ENDPOINT =
  "https://lizheng.blog/api/authors/profile";

export const AUTHOR_PROFILE_CACHE_TTL_MS = 5 * 60 * 1000;

export type AuthorProfile = {
  name: string | null;
  avatar: string | null;
};

export type AuthorProfileFetcher = (
  url: string,
  init?: RequestInit,
) => Promise<Response>;

const EMPTY: AuthorProfile = { name: null, avatar: null };
const SHA256_HEX = /^[0-9a-f]{64}$/;

const cache = new Map<string, { profile: AuthorProfile; exp: number }>();

export function __resetAuthorProfileCacheForTests(): void {
  cache.clear();
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSha256Hex(hash: string): boolean {
  return SHA256_HEX.test(hash);
}

export async function emailSha256Hex(email: string): Promise<string> {
  const bytes = new TextEncoder().encode(normalizeEmail(email));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

function pickProfile(data: unknown): AuthorProfile {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return EMPTY;
  }
  const rec = data as Record<string, unknown>;
  return {
    name: typeof rec.name === "string" && rec.name ? rec.name : null,
    avatar: typeof rec.avatar === "string" && rec.avatar ? rec.avatar : null,
  };
}

export async function fetchAuthorProfile(
  hash: string,
  fetcher: AuthorProfileFetcher = fetch,
): Promise<AuthorProfile> {
  if (!isSha256Hex(hash)) return EMPTY;

  const now = Date.now();
  const cached = cache.get(hash);
  if (cached && cached.exp > now) return cached.profile;

  try {
    const res = await fetcher(`${AUTHOR_PROFILE_ENDPOINT}?hash=${hash}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return EMPTY;
    const profile = pickProfile(await res.json());
    cache.set(hash, { profile, exp: now + AUTHOR_PROFILE_CACHE_TTL_MS });
    return profile;
  } catch {
    return EMPTY;
  }
}

export async function lookupAuthorProfile(
  email: string,
  fetcher: AuthorProfileFetcher = fetch,
): Promise<AuthorProfile> {
  return fetchAuthorProfile(await emailSha256Hex(email), fetcher);
}
