import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import {
  ChartFrame,
  ChartTooltipContent,
  chartAxis,
  getChartColor,
} from "@nocoo/basalt/components/chart";

interface DailyBackup {
  date: string;
  count: number;
}

export function DailyBackupsChart({ data }: { data: DailyBackup[] }) {
  if (data.length === 0) {
    return (
      <LayerCard>
        <LayerCard.Header>
          <div>
            <h3 className="text-basalt-base font-medium">Backup Activity</h3>
            <p className="text-basalt-sm text-basalt-muted-foreground">
              Daily backup count (last 30 days)
            </p>
          </div>
        </LayerCard.Header>
        <LayerCard.Empty title="No activity data" />
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
  const totalBackups = data.reduce((sum, day) => sum + day.count, 0);

  return (
    <LayerCard>
      <LayerCard.Header>
        <div>
          <h3 className="text-basalt-base font-medium">Backup Activity</h3>
          <p className="text-basalt-sm text-basalt-muted-foreground">
            Daily backup count (last 30 days)
          </p>
        </div>
      </LayerCard.Header>
      <LayerCard.Body>
        <ChartFrame
          ariaLabel="Daily backup activity for the last 30 days"
          summary={`${totalBackups} backups in the last 30 days.`}
          size="h-[200px] w-full"
        >
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="backupGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={getChartColor(0)} stopOpacity={0.3} />
                  <stop offset="95%" stopColor={getChartColor(0)} stopOpacity={0} />
                </linearGradient>
              </defs>
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
              <Area
                type="monotone"
                dataKey="count"
                name="Backups"
                stroke={getChartColor(0)}
                fill="url(#backupGradient)"
                strokeWidth={2}
              />
            </AreaChart>
          </ResponsiveContainer>
        </ChartFrame>
        <div className="mt-basalt-layout flex items-center justify-between border-t border-basalt-border pt-basalt-layout text-basalt-xs">
          <span className="text-basalt-muted-foreground">30-day total activity</span>
          <span className="font-medium text-basalt-foreground">
            {totalBackups} backup{totalBackups !== 1 ? "s" : ""}
          </span>
        </div>
      </LayerCard.Body>
    </LayerCard>
  );
}
