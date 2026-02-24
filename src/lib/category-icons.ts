/**
 * Category icon mapping — maps icon name strings to Lucide icon components.
 *
 * Only a curated subset is exposed to keep the bundle small and the UI simple.
 */

import {
  Folder,
  FolderKanban,
  Globe,
  Server,
  Database,
  Code,
  Smartphone,
  Monitor,
  Cloud,
  Shield,
  Zap,
  Star,
  Heart,
  Flag,
  Bookmark,
  Tag,
  Box,
  Package,
  Briefcase,
  Users,
  type LucideIcon,
} from "lucide-react";

/** All available icon entries with their display names. */
export const CATEGORY_ICONS: Array<{ name: string; label: string; icon: LucideIcon }> = [
  { name: "folder", label: "Folder", icon: Folder },
  { name: "folder-kanban", label: "Kanban", icon: FolderKanban },
  { name: "globe", label: "Globe", icon: Globe },
  { name: "server", label: "Server", icon: Server },
  { name: "database", label: "Database", icon: Database },
  { name: "code", label: "Code", icon: Code },
  { name: "smartphone", label: "Mobile", icon: Smartphone },
  { name: "monitor", label: "Desktop", icon: Monitor },
  { name: "cloud", label: "Cloud", icon: Cloud },
  { name: "shield", label: "Shield", icon: Shield },
  { name: "zap", label: "Zap", icon: Zap },
  { name: "star", label: "Star", icon: Star },
  { name: "heart", label: "Heart", icon: Heart },
  { name: "flag", label: "Flag", icon: Flag },
  { name: "bookmark", label: "Bookmark", icon: Bookmark },
  { name: "tag", label: "Tag", icon: Tag },
  { name: "box", label: "Box", icon: Box },
  { name: "package", label: "Package", icon: Package },
  { name: "briefcase", label: "Briefcase", icon: Briefcase },
  { name: "users", label: "Users", icon: Users },
];

const iconMap = new Map(CATEGORY_ICONS.map((e) => [e.name, e.icon]));

/** Resolve an icon name to its Lucide component. Falls back to Folder. */
export function getCategoryIcon(name: string): LucideIcon {
  return iconMap.get(name) ?? Folder;
}

/** Predefined palette of category colors. */
export const CATEGORY_COLORS = [
  "#6b7280", // gray
  "#ef4444", // red
  "#f97316", // orange
  "#eab308", // yellow
  "#22c55e", // green
  "#14b8a6", // teal
  "#3b82f6", // blue
  "#6366f1", // indigo
  "#8b5cf6", // violet
  "#ec4899", // pink
];
