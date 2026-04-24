import type { ReactNode } from "react";
import { Outlet } from "react-router";
import { RequireAuth } from "./lib/RequireAuth";

/**
 * App shell skeleton — sidebar + content slot. The full layout (sidebar
 * navigation, theme toggle, breadcrumbs) is ported in Wave D.4. This
 * stub keeps RequireAuth at the top of the protected subtree.
 */
export function AppLayout(): ReactNode {
  return (
    <RequireAuth>
      <div className="min-h-screen bg-background text-foreground">
        <main className="p-6">
          <Outlet />
        </main>
      </div>
    </RequireAuth>
  );
}
