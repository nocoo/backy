import { NextResponse } from "next/server";
import { executeD1Query } from "@/lib/db/d1-client";

interface StatsRow {
  total_projects: number;
  total_backups: number;
  total_size: number;
}

/**
 * GET /api/stats — Dashboard statistics.
 */
export async function GET() {
  try {
    const rows = await executeD1Query<StatsRow>(
      `SELECT
        (SELECT COUNT(*) FROM projects) as total_projects,
        (SELECT COUNT(*) FROM backups) as total_backups,
        (SELECT COALESCE(SUM(file_size), 0) FROM backups) as total_size`,
    );

    const stats = rows[0] ?? { total_projects: 0, total_backups: 0, total_size: 0 };

    return NextResponse.json({
      totalProjects: stats.total_projects,
      totalBackups: stats.total_backups,
      totalStorageBytes: stats.total_size,
    });
  } catch (error) {
    console.error("Failed to fetch stats:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 },
    );
  }
}
