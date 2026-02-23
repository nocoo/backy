"use client";

import { AppShell } from "@/components/layout/app-shell";

export default function HomePage() {
  return (
    <AppShell>
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Dashboard</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Overview of your backup activity
          </p>
        </div>

        {/* Stats cards - placeholder */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          <StatsCard label="Total Projects" value="—" />
          <StatsCard label="Total Backups" value="—" />
          <StatsCard label="Storage Used" value="—" />
        </div>

        {/* Recent backups - placeholder */}
        <div>
          <h2 className="text-sm font-medium text-muted-foreground mb-3">
            Recent Backups
          </h2>
          <div className="rounded-lg border border-border bg-background/50 p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No backups yet. Create a project and configure your AI agent to start sending backups.
            </p>
          </div>
        </div>
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
