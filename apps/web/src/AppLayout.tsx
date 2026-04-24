import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { RequireAuth } from "./lib/RequireAuth";
import { AppShell } from "./components/layout/app-shell";

/**
 * Protected layout: CF Access gate → SWR /api/me check → AppShell with
 * sidebar / breadcrumbs / theme toggle. Per-route breadcrumbs land in the
 * page-level Wave D sub-steps.
 */
export function AppLayout(): ReactNode {
  return (
    <RequireAuth>
      <AppShell>
        <Outlet />
      </AppShell>
    </RequireAuth>
  );
}
