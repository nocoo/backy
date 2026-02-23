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

/**
 * GET /api/stats/charts — Chart data for dashboard.
 *
 * Returns:
 *   - projectStats: per-project backup count + storage size
 *   - dailyBackups: backup count per day (last 30 days)
 *   - storageByProject: same as projectStats but focused on storage breakdown
 */
export async function GET() {
  try {
    const [projectStats, dailyBackups] = await Promise.all([
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
    ]);

    return NextResponse.json({
      projectStats,
      dailyBackups,
    });
  } catch (error) {
    console.error("Failed to fetch chart data:", error);
    return NextResponse.json(
      { error: "Failed to fetch chart data" },
      { status: 500 },
    );
  }
}
