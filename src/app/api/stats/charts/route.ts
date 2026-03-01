import { NextResponse } from "next/server";
import { executeD1Query } from "@/lib/db/d1-client";

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

/**
 * GET /api/stats/charts — Chart data for dashboard.
 *
 * Returns:
 *   - projectStats: per-project backup count + storage size
 *   - dailyBackups: backup count per day (last 30 days)
 *   - cronStats: cron log status breakdown per day (last 30 days)
 */
export async function GET() {
  try {
    const [projectStats, dailyBackups, cronStats] = await Promise.all([
      executeD1Query<ProjectStat>(
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
      executeD1Query<DailyBackup>(
        `SELECT
          DATE(created_at) as date,
          COUNT(*) as count
        FROM backups
        WHERE created_at >= DATE('now', '-30 days')
        GROUP BY DATE(created_at)
        ORDER BY date ASC`,
      ),
      executeD1Query<DailyCronStat>(
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

    return NextResponse.json({
      projectStats,
      dailyBackups,
      cronStats,
    });
  } catch (error) {
    console.error("Failed to fetch chart data:", error);
    return NextResponse.json(
      { error: "Failed to fetch chart data" },
      { status: 500 },
    );
  }
}
