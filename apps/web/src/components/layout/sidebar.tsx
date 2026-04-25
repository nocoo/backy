import { useState } from "react";
import { Link, useLocation } from "react-router";
import {
  LayoutDashboard,
  FolderKanban,
  Archive,
  PanelLeft,
  LogOut,
  ScrollText,
  Timer,
  ChevronUp,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { useMe } from "@/lib/useMe";
import { CF_ACCESS_LOGOUT_URL } from "@/lib/RequireAuth";
import { useSidebar } from "./sidebar-context";
import {
  Collapsible,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

const AVATAR_COLORS = [
  "bg-red-600",
  "bg-orange-600",
  "bg-amber-600",
  "bg-emerald-600",
  "bg-teal-600",
  "bg-cyan-600",
  "bg-blue-600",
  "bg-indigo-600",
  "bg-violet-600",
  "bg-pink-600",
] as const;

export function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length] ?? "bg-blue-600";
}

interface NavItem {
  href: string;
  label: string;
  icon: LucideIcon;
}

interface NavGroup {
  label: string;
  items: NavItem[];
  defaultOpen?: boolean;
}

const navGroups: NavGroup[] = [
  {
    label: "Overview",
    defaultOpen: true,
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/backups", label: "Backups", icon: Archive },
    ],
  },
  {
    label: "Monitoring",
    defaultOpen: true,
    items: [
      { href: "/logs", label: "Webhook Logs", icon: ScrollText },
      { href: "/cron-logs", label: "Cron Logs", icon: Timer },
    ],
  },
];

const allNavItems = navGroups.flatMap((g) => g.items);

function isActiveRoute(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

function NavGroupSection({
  group,
  pathname,
}: {
  group: NavGroup;
  pathname: string;
}) {
  const [open, setOpen] = useState(group.defaultOpen ?? true);

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="px-3 mt-2">
        <CollapsibleTrigger className="flex w-full items-center justify-between px-3 py-2 cursor-pointer">
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
            {group.label}
          </span>
          <ChevronUp
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground/50 transition-transform duration-200",
              !open && "rotate-180",
            )}
            strokeWidth={1.5}
          />
        </CollapsibleTrigger>
      </div>
      <div
        className="grid overflow-hidden"
        style={{
          gridTemplateRows: open ? "1fr" : "0fr",
          transition: "grid-template-rows 200ms ease-out",
        }}
      >
        <div className="min-h-0 overflow-hidden">
          <div className="flex flex-col gap-0.5 px-3">
            {group.items.map((item) => {
              const active = isActiveRoute(pathname, item.href);
              return (
                <Link
                  key={item.href}
                  to={item.href}
                  className={cn(
                    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-normal transition-colors",
                    active
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <item.icon
                    className="h-4 w-4 shrink-0"
                    strokeWidth={1.5}
                  />
                  <span className="flex-1 text-left">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </div>
      </div>
    </Collapsible>
  );
}

export function Sidebar() {
  const { pathname } = useLocation();
  const { collapsed, toggle } = useSidebar();
  const { email } = useMe();

  const userEmail = email ?? "";
  const userName = userEmail ? (userEmail.split("@")[0] ?? "User") : "User";
  const userInitial = userName[0]?.toUpperCase() ?? "?";

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col bg-background transition-all duration-300 ease-in-out overflow-hidden",
        collapsed ? "w-[68px]" : "w-[260px]",
      )}
    >
      {collapsed ? (
        <div className="flex h-screen w-[68px] flex-col items-center">
          <div className="flex h-14 w-full items-center justify-start pl-6">
            <img
              src="/logo-24.png"
              alt="Backy"
              width={24}
              height={24}
              className="shrink-0"
            />
          </div>
          <button
            onClick={toggle}
            aria-label="Expand sidebar"
            title="Expand sidebar"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors mb-2"
          >
            <PanelLeft
              className="h-4 w-4"
              aria-hidden="true"
              strokeWidth={1.5}
            />
          </button>
          <nav className="flex-1 flex flex-col items-center gap-1 overflow-y-auto pt-1">
            <TooltipProvider delayDuration={0}>
              {allNavItems.map((item) => {
                const active = isActiveRoute(pathname, item.href);
                return (
                  <Tooltip key={item.href}>
                    <TooltipTrigger asChild>
                      <Link
                        to={item.href}
                        className={cn(
                          "relative flex h-10 w-10 items-center justify-center rounded-lg transition-colors",
                          active
                            ? "bg-accent text-foreground"
                            : "text-muted-foreground hover:bg-accent hover:text-foreground",
                        )}
                      >
                        <item.icon className="h-4 w-4" strokeWidth={1.5} />
                      </Link>
                    </TooltipTrigger>
                    <TooltipContent side="right" sideOffset={8}>
                      {item.label}
                    </TooltipContent>
                  </Tooltip>
                );
              })}
            </TooltipProvider>
          </nav>
          <div className="py-3 flex justify-center w-full">
            <a
              href={CF_ACCESS_LOGOUT_URL}
              title={`${userName} - Sign out`}
              className="cursor-pointer hover:ring-2 hover:ring-primary/30 transition-all rounded-full"
            >
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback
                  className={cn(
                    "text-xs text-white",
                    getAvatarColor(userName),
                  )}
                >
                  {userInitial}
                </AvatarFallback>
              </Avatar>
            </a>
          </div>
        </div>
      ) : (
        <div className="flex h-screen w-[260px] flex-col">
          <div className="px-3 h-14 flex items-center">
            <div className="flex w-full items-center justify-between px-3">
              <div className="flex items-center gap-3">
                <img
                  src="/logo-24.png"
                  alt="Backy"
                  width={24}
                  height={24}
                  className="shrink-0"
                />
                <span className="text-lg font-bold tracking-tighter">
                  backy
                </span>
                <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  v{APP_VERSION}
                </span>
              </div>
              <button
                onClick={toggle}
                aria-label="Collapse sidebar"
                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors"
              >
                <PanelLeft
                  className="h-4 w-4"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </button>
            </div>
          </div>
          <nav className="flex-1 overflow-y-auto pt-1">
            {navGroups.map((group) => (
              <NavGroupSection
                key={group.label}
                group={group}
                pathname={pathname}
              />
            ))}
          </nav>
          <div className="px-4 py-3">
            <div className="flex items-center gap-3">
              <Avatar className="h-9 w-9 shrink-0">
                <AvatarFallback
                  className={cn(
                    "text-xs text-white",
                    getAvatarColor(userName),
                  )}
                >
                  {userInitial}
                </AvatarFallback>
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">
                  {userName}
                </p>
                <p className="text-xs text-muted-foreground truncate">
                  {userEmail}
                </p>
              </div>
              <a
                href={CF_ACCESS_LOGOUT_URL}
                aria-label="Sign out"
                title="Sign out"
                className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors shrink-0 cursor-pointer"
              >
                <LogOut
                  className="h-4 w-4"
                  aria-hidden="true"
                  strokeWidth={1.5}
                />
              </a>
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}
