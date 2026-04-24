import type { ReactNode } from "react";
import { useEffect } from "react";
import { useMe } from "./useMe";
import { ApiError } from "./api";

/**
 * Wraps protected routes. CF Access blocks unauthenticated requests at
 * the worker edge — we only need a UX shim for "session expired mid-flight":
 *
 *   - loading → render fallback (skeleton)
 *   - 401     → reload the page so CF Access redirects to SSO
 *   - other   → render error
 *   - email   → render children
 *
 * We do NOT validate tokens client-side (Access already did).
 */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { email, isLoading, error } = useMe();

  useEffect(() => {
    if (error instanceof ApiError && error.status === 401) {
      window.location.reload();
    }
  }, [error]);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Loading…
      </div>
    );
  }

  if (error instanceof ApiError && error.status === 401) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Redirecting to login…
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center text-destructive">
        Failed to load session: {error.message}
      </div>
    );
  }

  if (!email) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        Redirecting to login…
      </div>
    );
  }

  return <>{children}</>;
}

export const CF_ACCESS_LOGOUT_URL =
  "https://nocoo.cloudflareaccess.com/cdn-cgi/access/logout";
