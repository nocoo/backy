import { NextResponse } from "next/server";
import { getBackup, deleteBackup } from "@/lib/db/backups";
import { deleteFromR2 } from "@/lib/r2/client";

/**
 * GET /api/backups/[id] — Get a single backup.
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

    return NextResponse.json(backup);
  } catch (error) {
    console.error("Failed to get backup:", error);
    return NextResponse.json(
      { error: "Failed to get backup" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/backups/[id] — Delete a backup and its files from R2.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const keys = await deleteBackup(id);

    if (!keys) {
      return NextResponse.json({ error: "Backup not found" }, { status: 404 });
    }

    // Clean up R2 files (non-blocking errors are fine)
    try {
      await deleteFromR2(keys.fileKey);
      if (keys.jsonKey) {
        await deleteFromR2(keys.jsonKey);
      }
    } catch (r2Error) {
      console.error("R2 cleanup error (non-fatal):", r2Error);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete backup:", error);
    return NextResponse.json(
      { error: "Failed to delete backup" },
      { status: 500 },
    );
  }
}
