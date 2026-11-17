import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import {
  ChartFrame,
  ChartTooltipContent,
  chartAxis,
  getChartColor,
} from "@nocoo/basalt/components/chart";

export { getChartColor } from "@nocoo/basalt/components/chart";

interface ProjectStat {
  project_id: string;
  project_name: string;
  backup_count: number;
  total_size: number;
}

export function truncateProjectName(name: string): string {
  return name.length > 12 ? `${name.slice(0, 12)}...` : name;
}

export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"] as const;
  const i = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function ProjectChart({
  data,
  title,
  description,
  ariaLabel,
  dataKey,
  emptyTitle,
  valueFormatter,
  footerFormatter,
}: {
  data: ProjectStat[];
  title: string;
  description: string;
  ariaLabel: string;
  dataKey: "backup_count" | "total_size";
  emptyTitle: string;
  valueFormatter: (value: number) => string;
  footerFormatter: (value: number) => string;
}) {
  if (data.length === 0) {
    return (
      <LayerCard>
        <LayerCard.Header><div><h3 className="text-basalt-base font-medium">{title}</h3><p className="text-basalt-sm text-basalt-muted-foreground">{description}</p></div></LayerCard.Header>
        <LayerCard.Empty title={emptyTitle} />
      </LayerCard>
    );
  }

  const chartData = data.map((item) => ({ ...item, name: truncateProjectName(item.project_name) }));
  return (
    <LayerCard>
      <LayerCard.Header><div><h3 className="text-basalt-base font-medium">{title}</h3><p className="text-basalt-sm text-basalt-muted-foreground">{description}</p></div></LayerCard.Header>
      <LayerCard.Body>
        <ChartFrame ariaLabel={ariaLabel} size="h-[200px] w-full" summary={data.map((item) => `${item.project_name}: ${footerFormatter(item[dataKey])}`).join("; ")}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={chartAxis} opacity={0.25} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: chartAxis }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: chartAxis }} tickLine={false} axisLine={false} allowDecimals={dataKey === "total_size"} tickFormatter={valueFormatter} />
              <Tooltip content={<ChartTooltipContent formatter={valueFormatter} />} isAnimationActive={false} />
              <Bar dataKey={dataKey} name={dataKey === "backup_count" ? "Backups" : "Storage"} radius={[4, 4, 0, 0]} maxBarSize={40}>
                {chartData.map((item, index) => <Cell key={item.project_id} fill={getChartColor(index)} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </ChartFrame>
        <div className="mt-basalt-layout space-y-basalt-space-lg border-t border-basalt-border pt-basalt-layout">
          {data.slice(0, 3).map((project) => (
            <div key={project.project_id} className="flex items-center justify-between gap-basalt-space-lg text-basalt-xs">
              <span className="min-w-0 truncate text-basalt-muted-foreground" title={project.project_name}>{truncateProjectName(project.project_name)}</span>
              <span className="shrink-0 font-medium">{footerFormatter(project[dataKey])}</span>
            </div>
          ))}
        </div>
      </LayerCard.Body>
    </LayerCard>
  );
}

export function BackupsByProjectChart({ data }: { data: ProjectStat[] }) {
  return <ProjectChart data={data} title="Backups by Project" description="Backup count per project" ariaLabel="Backup count by project" dataKey="backup_count" emptyTitle="No project data" valueFormatter={String} footerFormatter={(value) => `${value} backup${value !== 1 ? "s" : ""}`} />;
}

export function StorageByProjectChart({ data }: { data: ProjectStat[] }) {
  return <ProjectChart data={data} title="Storage by Project" description="R2 storage usage per project" ariaLabel="Storage usage by project" dataKey="total_size" emptyTitle="No storage data" valueFormatter={formatBytes} footerFormatter={formatBytes} />;
}
