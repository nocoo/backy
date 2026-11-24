import { useLocation } from "react-router";
import {
  Archive,
  FolderKanban,
  LayoutDashboard,
  ScrollText,
  Timer,
  type LucideIcon,
} from "@nocoo/basalt/icons";
import { Avatar, AvatarFallback, AvatarImage } from "@nocoo/basalt/components/avatar";
import {
  Sidebar as BasaltSidebar,
  SidebarBrand,
  SidebarFooter,
  SidebarGroup,
  SidebarHeader,
  SidebarIconItem,
  SidebarItem,
  SidebarNav,
  SidebarToggle,
  SidebarUser,
} from "@nocoo/basalt/components/sidebar";
import { Tooltip, TooltipContent, TooltipTrigger } from "@nocoo/basalt/components/tooltip";
import { cn } from "@/lib/utils";
import { APP_VERSION } from "@/lib/version";
import { useMe } from "@/lib/useMe";
import { CF_ACCESS_LOGOUT_URL } from "@/lib/RequireAuth";

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

const navGroups: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Overview",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/projects", label: "Projects", icon: FolderKanban },
      { href: "/backups", label: "Backups", icon: Archive },
    ],
  },
  {
    label: "Monitoring",
    items: [
      { href: "/logs", label: "Webhook Logs", icon: ScrollText },
      { href: "/cron-logs", label: "Cron Logs", icon: Timer },
    ],
  },
];

function isActiveRoute(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname.startsWith(href);
}

export function Sidebar({
  collapsed,
  onDismiss,
  resizable = true,
}: {
  collapsed: boolean;
  onDismiss?: (() => void) | undefined;
  resizable?: boolean | undefined;
}) {
  const { pathname } = useLocation();
  const { email, name, avatar: avatarUrl } = useMe();
  const userEmail = email ?? "";
  const userName = name || userEmail.split("@")[0] || "User";
  const userInitial = userName[0]?.toUpperCase() ?? "?";
  const avatar = (
    <Avatar>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={userName} /> : null}
      <AvatarFallback className={cn("text-basalt-xs text-white", getAvatarColor(userName))}>
        {userInitial}
      </AvatarFallback>
    </Avatar>
  );

  return (
    <BasaltSidebar resizable={resizable}>
      <SidebarHeader>
        <SidebarBrand
          logo={<img src="/logo-24.png" alt="" />}
          name="backy"
          version={`v${APP_VERSION}`}
          action={
            onDismiss ? <SidebarToggle mode="dismiss" onDismiss={onDismiss} /> : <SidebarToggle />
          }
        />
      </SidebarHeader>
      <SidebarNav aria-label="Application navigation">
        {collapsed
          ? navGroups
              .flatMap((group) => group.items)
              .map((item) => (
                <Tooltip key={item.href}>
                  <TooltipTrigger asChild>
                    <SidebarIconItem href={item.href} active={isActiveRoute(pathname, item.href)}>
                      <item.icon className="h-4 w-4" strokeWidth={1.5} />
                      <span className="sr-only">{item.label}</span>
                    </SidebarIconItem>
                  </TooltipTrigger>
                  <TooltipContent side="right">{item.label}</TooltipContent>
                </Tooltip>
              ))
          : navGroups.map((group) => (
              <SidebarGroup key={group.label} label={group.label} defaultOpen>
                {group.items.map((item) => (
                  <SidebarItem
                    key={item.href}
                    href={item.href}
                    active={isActiveRoute(pathname, item.href)}
                  >
                    <item.icon className="h-4 w-4 shrink-0" strokeWidth={1.5} />
                    <span className="flex-1 truncate">{item.label}</span>
                  </SidebarItem>
                ))}
              </SidebarGroup>
            ))}
      </SidebarNav>
      <SidebarFooter>
        <SidebarUser
          name={userName}
          email={userEmail}
          avatar={avatar}
          signOutHref={CF_ACCESS_LOGOUT_URL}
        />
      </SidebarFooter>
    </BasaltSidebar>
  );
}
