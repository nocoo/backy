"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Archive, Loader2 } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";

interface Stats {
  totalProjects: number;
  totalBackups: number;
  totalStorageBytes: number;
}

interface RecentBackup {
  id: string;
  project_id: string;
  project_name: string;
  environment: string | null;
  tag: string | null;
  file_size: number;
  is_single_json: number;
  created_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function HomePage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [recentBackups, setRecentBackups] = useState<RecentBackup[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const [statsRes, backupsRes] = await Promise.all([
        fetch("/api/stats"),
        fetch("/api/backups"),
      ]);

      if (statsRes.ok) {
        const data: Stats = await statsRes.json();
        setStats(data);
      }

      if (backupsRes.ok) {
        const data = await backupsRes.json();
        setRecentBackups((data.items as RecentBackup[]).slice(0, 5));
      }
    } catch {
      // Silently fail — dashboard is best-effort
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your backup activity
          </p>
        </div>

        {/* Stats cards */}
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <StatsCard
                label="Total Projects"
                value={String(stats?.totalProjects ?? 0)}
              />
              <StatsCard
                label="Total Backups"
                value={String(stats?.totalBackups ?? 0)}
              />
              <StatsCard
                label="Storage Used"
                value={formatBytes(stats?.totalStorageBytes ?? 0)}
              />
            </div>

            {/* Recent backups */}
            <div>
              <h2 className="text-sm font-medium text-muted-foreground mb-3">
                Recent Backups
              </h2>
              {recentBackups.length === 0 ? (
                <div className="rounded-lg border border-border bg-background/50 p-8 text-center">
                  <p className="text-sm text-muted-foreground">
                    No backups yet. Create a project and configure your AI agent
                    to start sending backups.
                  </p>
                </div>
              ) : (
                <div className="flex flex-col gap-2">
                  {recentBackups.map((backup) => (
                    <Link
                      key={backup.id}
                      href={`/projects/${backup.project_id}`}
                      className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3 transition-colors hover:bg-accent/50"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                          <Archive className="h-3.5 w-3.5" />
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-medium text-foreground truncate">
                              {backup.project_name}
                            </span>
                            {backup.environment && (
                              <Badge variant="secondary">
                                {backup.environment}
                              </Badge>
                            )}
                            {backup.tag && (
                              <Badge variant="outline">{backup.tag}</Badge>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground">
                            {formatDate(backup.created_at)}
                          </span>
                        </div>
                      </div>
                      <span className="text-xs text-muted-foreground shrink-0 ml-3">
                        {formatBytes(backup.file_size)}
                      </span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}

function StatsCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/50 p-4">
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      <p className="text-2xl font-semibold text-foreground mt-1">{value}</p>
    </div>
  );
}
