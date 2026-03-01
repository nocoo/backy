"use client";

import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { CSSProperties } from "react";

export interface DailyCronStat {
  date: string;
  success: number;
  failed: number;
  skipped: number;
  triggered: number;
}

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ value: number; dataKey: string; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;

  const date = label
    ? new Date(label).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      })
    : "";

  const total = payload.reduce((sum, entry) => sum + (entry.value ?? 0), 0);

  return (
    <div className="rounded-lg border border-border bg-background px-3 py-2 shadow-md">
      <p className="text-sm font-medium text-foreground mb-1">{date}</p>
      {payload.map((entry, i) => (
        <p key={i} className="text-xs text-muted-foreground flex items-center gap-1.5">
          <span
            className="inline-block h-2 w-2 rounded-full"
            style={{ backgroundColor: entry.color } as CSSProperties}
          />
          {entry.dataKey}: {entry.value}
        </p>
      ))}
      <p className="text-xs text-muted-foreground mt-1 pt-1 border-t border-border">
        Total: {total}
      </p>
    </div>
  );
}

export function CronActivityChart({ data }: { data: DailyCronStat[] }) {
  if (data.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Cron Activity</CardTitle>
          <CardDescription>Auto-backup trigger results (last 30 days)</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex h-[200px] items-center justify-center">
            <p className="text-sm text-muted-foreground">No cron activity data</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const chartData = data.map((d) => ({
    ...d,
    label: new Date(d.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">Cron Activity</CardTitle>
        <CardDescription>Auto-backup trigger results (last 30 days)</CardDescription>
      </CardHeader>
      <CardContent>
        <ResponsiveContainer width="100%" height={200}>
          <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
              tickLine={false}
              axisLine={false}
              allowDecimals={false}
            />
            <Tooltip
              content={<CustomTooltip />}
              isAnimationActive={false}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              wrapperStyle={{ fontSize: 11 }}
            />
            <Bar dataKey="success" stackId="cron" fill="hsl(var(--chart-2))" radius={[0, 0, 0, 0]} maxBarSize={40} />
            <Bar dataKey="failed" stackId="cron" fill="hsl(var(--destructive))" radius={[0, 0, 0, 0]} maxBarSize={40} />
            <Bar dataKey="skipped" stackId="cron" fill="hsl(var(--chart-4))" radius={[4, 4, 0, 0]} maxBarSize={40} />
          </BarChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  );
}
