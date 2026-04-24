import { json, type HandlerResponse } from "../http/response";
import type { RuntimeContext } from "../runtime";

interface StatsRow {
  total_projects: number;
  total_backups: number;
  total_size: number;
}

interface ProjectStat {
  project_id: string;
  project_name: string;
  backup_count: number;
  total_size: number;
  latest_backup: string | null;
}

interface DailyBackup {
  date: string;
  count: number;
}

interface DailyCronStat {
  date: string;
  success: number;
  failed: number;
  skipped: number;
  triggered: number;
}

export async function statsTotalsHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const { results } = await ctx.db.query<StatsRow>(
      `SELECT
        (SELECT COUNT(*) FROM projects) as total_projects,
        (SELECT COUNT(*) FROM backups) as total_backups,
        (SELECT COALESCE(SUM(file_size), 0) FROM backups) as total_size`,
    );
    const stats = results[0] ?? {
      total_projects: 0,
      total_backups: 0,
      total_size: 0,
    };
    return json(200, {
      totalProjects: stats.total_projects,
      totalBackups: stats.total_backups,
      totalStorageBytes: stats.total_size,
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return json(500, { error: "Failed to fetch stats" });
  }
}

export async function statsChartsHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const [projectStatsR, dailyBackupsR, cronStatsR] = await Promise.all([
      ctx.db.query<ProjectStat>(
        `SELECT
          p.id as project_id,
          p.name as project_name,
          COUNT(b.id) as backup_count,
          COALESCE(SUM(b.file_size), 0) as total_size,
          MAX(b.created_at) as latest_backup
        FROM projects p
        LEFT JOIN backups b ON p.id = b.project_id
        GROUP BY p.id, p.name
        ORDER BY backup_count DESC`,
      ),
      ctx.db.query<DailyBackup>(
        `SELECT
          DATE(created_at) as date,
          COUNT(*) as count
        FROM backups
        WHERE created_at >= DATE('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC`,
      ),
      ctx.db.query<DailyCronStat>(
        `SELECT
          DATE(triggered_at) as date,
          SUM(CASE WHEN status = 'success' THEN 1 ELSE 0 END) as success,
          SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
          SUM(CASE WHEN status = 'skipped' THEN 1 ELSE 0 END) as skipped,
          SUM(CASE WHEN status = 'triggered' THEN 1 ELSE 0 END) as triggered
        FROM cron_logs
        WHERE triggered_at >= DATE('now', '-30 days')
        GROUP BY DATE(triggered_at)
        ORDER BY date ASC`,
      ),
    ]);
    return json(200, {
      projectStats: projectStatsR.results,
      dailyBackups: dailyBackupsR.results,
      cronStats: cronStatsR.results,
    });
  } catch (error) {
    console.error("Failed to fetch chart data:", error);
    return json(500, { error: "Failed to fetch chart data" });
  }
}
