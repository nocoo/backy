import { useEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { AppHeader, AppHeaderMenuButton, ProjectLinks } from "@nocoo/basalt/components/app-header";
import {
  AppMain,
  AppShell as BasaltAppShell,
  AppSkipLink,
} from "@nocoo/basalt/components/app-shell";
import { ContentIsland, SidebarDrawer, SidebarProvider } from "@nocoo/basalt/components/sidebar";
import { ThemeToggle } from "@nocoo/basalt/components/theme-toggle";
import { Sidebar } from "./sidebar";
import { useIsMobile } from "@/hooks/use-mobile";

function pageChrome(pathname: string): {
  title: string;
  breadcrumbs: Array<{ href?: string; label: string }>;
} {
  if (pathname === "/") return { title: "Dashboard", breadcrumbs: [] };
  if (pathname === "/projects/new") {
    return { title: "New Project", breadcrumbs: [{ href: "/projects", label: "Projects" }] };
  }
  if (pathname.startsWith("/projects/")) {
    return { title: "Project", breadcrumbs: [{ href: "/projects", label: "Projects" }] };
  }
  if (pathname === "/projects") return { title: "Projects", breadcrumbs: [] };
  if (pathname.startsWith("/backups/")) {
    return { title: "Backup", breadcrumbs: [{ href: "/backups", label: "Backups" }] };
  }
  if (pathname === "/backups") return { title: "Backups", breadcrumbs: [] };
  if (pathname === "/logs") return { title: "Webhook Logs", breadcrumbs: [] };
  if (pathname === "/cron-logs") return { title: "Cron Logs", breadcrumbs: [] };
  return { title: "Not found", breadcrumbs: [] };
}

export function AppShell({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const isMobile = useIsMobile();
  const { pathname } = useLocation();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const chrome = pageChrome(pathname);

  useEffect(() => {
    if (pathname) setMobileOpen(false);
  }, [pathname]);

  return (
    <SidebarProvider collapsed={collapsed} onCollapsedChange={setCollapsed}>
      <BasaltAppShell layout="responsive">
        <AppSkipLink>Skip to content</AppSkipLink>
        {!isMobile ? <Sidebar collapsed={collapsed} /> : null}
        <AppMain>
          <AppHeader
            title={chrome.title}
            breadcrumbs={chrome.breadcrumbs}
            leading={
              isMobile ? (
                <AppHeaderMenuButton
                  ref={triggerRef}
                  onClick={() => setMobileOpen(true)}
                  aria-controls="backy-navigation"
                />
              ) : undefined
            }
            actions={
              <>
                <ProjectLinks github="nocoo/backy" hexly="backy" name="Backy" />
                <ThemeToggle />
              </>
            }
          />
          <div className="flex min-h-0 flex-1 flex-col md:px-basalt-layout-sm md:pb-basalt-layout-sm">
            <ContentIsland>{children}</ContentIsland>
          </div>
        </AppMain>
        {isMobile ? (
          <SidebarDrawer
            id="backy-navigation"
            open={mobileOpen}
            onOpenChange={setMobileOpen}
            returnFocusRef={triggerRef}
          >
            <Sidebar collapsed={false} onDismiss={() => setMobileOpen(false)} resizable={false} />
          </SidebarDrawer>
        ) : null}
      </BasaltAppShell>
    </SidebarProvider>
  );
}
