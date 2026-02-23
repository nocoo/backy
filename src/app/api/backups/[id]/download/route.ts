import { NextResponse } from "next/server";
import { getBackup } from "@/lib/db/backups";
import { createPresignedDownloadUrl } from "@/lib/r2/client";

/**
 * GET /api/backups/[id]/download — Generate a presigned download URL.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const backup = await getBackup(id);

    if (!backup) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    const url = await createPresignedDownloadUrl(backup.file_key);

    return NextResponse.json({
      url,
      file_key: backup.file_key,
      file_size: backup.file_size,
      expires_in: 900,
    });
  } catch (error) {
    console.error("Failed to generate download URL:", error);
    return NextResponse.json(
      { error: "Failed to generate download URL" },
      { status: 500 },
    );
  }
}
