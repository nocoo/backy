"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import {
  LayoutDashboard,
  FolderKanban,
  Archive,
  PanelLeft,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "./sidebar-context";

const navItems = [
  { href: "/", label: "Dashboard", icon: LayoutDashboard },
  { href: "/projects", label: "Projects", icon: FolderKanban },
  { href: "/backups", label: "Backups", icon: Archive },
];

export function Sidebar() {
  const pathname = usePathname();
  const { collapsed, toggle } = useSidebar();
  const { data: session } = useSession();

  const userName = session?.user?.name ?? "User";
  const userInitial = userName[0] ?? "?";

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-[68px]" : "w-[240px]",
      )}
    >
      {collapsed ? (
        /* ── Collapsed (icon-only) view ── */
        <div className="flex h-screen w-[68px] flex-col items-center">
          {/* Logo */}
          <div className="flex h-14 w-full items-center justify-start pl-[22px]">
            <Image
              src="/logo-24.png"
              alt="Backy"
              width={24}
              height={24}
              className="shrink-0"
            />
          </div>

          {/* Expand toggle */}
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
          >
            <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
          </button>

          {/* Navigation */}
          <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
            {navItems.map((item) => {
              const isActive =
                item.href === "/"
                  ? pathname === "/"
                  : pathname.startsWith(item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  title={item.label}
                  className={cn(
                    "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                    isActive
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon className="h-4 w-4" strokeWidth={1.5} />
                </Link>
              );
            })}
          </nav>

          {/* User sign out */}
          <div className="py-3 flex justify-center w-full">
            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              title={`${userName} - Sign out`}
              className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium cursor-pointer hover:bg-primary/20 transition-colors"
            >
              {userInitial}
            </button>
          </div>
        </div>
      ) : (
        /* ── Expanded view ── */
        <div className="flex h-screen w-[240px] flex-col">
          {/* Header: logo + collapse toggle */}
          <div className="px-3 h-14 flex items-center">
            <div className="flex w-full items-center justify-between px-3">
              <div className="flex items-center gap-3">
                <Image
                  src="/logo-24.png"
                  alt="Backy"
                  width={24}
                  height={24}
                  className="shrink-0"
                />
                <span className="text-lg font-bold tracking-tighter">backy</span>
              </div>
              <button
                onClick={toggle}
                aria-label="Collapse sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <PanelLeft className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
              </button>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto pt-1">
            <div className="flex flex-col gap-0.5 px-3">
              {navItems.map((item) => {
                const isActive =
                  item.href === "/"
                    ? pathname === "/"
                    : pathname.startsWith(item.href);

                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                      isActive
                        ? "bg-accent text-foreground"
                        : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 text-left">{item.label}</span>
                  </Link>
                );
              })}
            </div>
          </nav>

          {/* User info + sign out */}
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-medium">
                {userInitial}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{userName}</p>
                <p className="text-xs text-muted-foreground truncate">Administrator</p>
              </div>
              <button
                onClick={() => signOut({ callbackUrl: "/login" })}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
              >
                <LogOut className="h-4 w-4" aria-hidden="true" strokeWidth={1.5} />
              </button>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
