import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import {
  ChartFrame,
  ChartLegend,
  ChartTooltipContent,
  chartAxis,
  getChartColor,
} from "@nocoo/basalt/components/chart";

export interface DailyCronStat {
  date: string;
  success: number;
  failed: number;
  skipped: number;
  triggered: number;
}

const legendItems = [
  { key: "success", label: "Success", color: getChartColor(1) },
  { key: "failed", label: "Failed", color: "hsl(var(--basalt-destructive))" },
  { key: "skipped", label: "Skipped", color: getChartColor(3) },
];

export function CronActivityChart({ data }: { data: DailyCronStat[] }) {
  if (data.length === 0) {
    return (
      <LayerCard>
        <LayerCard.Header>
          <div>
            <h3 className="text-basalt-base font-medium">Cron Activity</h3>
            <p className="text-basalt-sm text-basalt-muted-foreground">
              Auto-backup trigger results (last 30 days)
            </p>
          </div>
        </LayerCard.Header>
        <LayerCard.Empty title="No cron activity data" />
      </LayerCard>
    );
  }

  const chartData = data.map((day) => ({
    ...day,
    label: new Date(day.date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    }),
  }));
  const totals = data.reduce(
    (acc, day) => ({
      success: acc.success + day.success,
      failed: acc.failed + day.failed,
      skipped: acc.skipped + day.skipped,
    }),
    { success: 0, failed: 0, skipped: 0 },
  );

  return (
    <LayerCard>
      <LayerCard.Header>
        <div>
          <h3 className="text-basalt-base font-medium">Cron Activity</h3>
          <p className="text-basalt-sm text-basalt-muted-foreground">
            Auto-backup trigger results (last 30 days)
          </p>
        </div>
      </LayerCard.Header>
      <LayerCard.Body>
        <ChartFrame
          ariaLabel="Cron backup results for the last 30 days"
          summary={`${totals.success} succeeded, ${totals.failed} failed, and ${totals.skipped} were skipped.`}
          legend={<ChartLegend items={legendItems} />}
          size="h-[200px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartAxis} opacity={0.25} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: 11, fill: chartAxis }}
                tickLine={false}
                axisLine={false}
              />
              <YAxis
                tick={{ fontSize: 11, fill: chartAxis }}
                tickLine={false}
                axisLine={false}
                allowDecimals={false}
              />
              <Tooltip content={<ChartTooltipContent />} isAnimationActive={false} />
              <Bar dataKey="success" stackId="cron" fill={getChartColor(1)} maxBarSize={40} />
              <Bar
                dataKey="failed"
                stackId="cron"
                fill="hsl(var(--basalt-destructive))"
                maxBarSize={40}
              />
              <Bar
                dataKey="skipped"
                stackId="cron"
                fill={getChartColor(3)}
                radius={[4, 4, 0, 0]}
                maxBarSize={40}
              />
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <div className="mt-basalt-layout grid grid-cols-3 gap-basalt-space-lg border-t border-basalt-border pt-basalt-layout text-basalt-xs">
          <div className="text-center">
            <div className="text-basalt-muted-foreground">Success</div>
            <div className="mt-basalt-space-sm font-medium">{totals.success}</div>
          </div>
          <div className="text-center">
            <div className="text-basalt-muted-foreground">Failed</div>
            <div className="mt-basalt-space-sm font-medium">{totals.failed}</div>
          </div>
          <div className="text-center">
            <div className="text-basalt-muted-foreground">Skipped</div>
            <div className="mt-basalt-space-sm font-medium">{totals.skipped}</div>
          </div>
        </div>
      </LayerCard.Body>
    </LayerCard>
  );
}
