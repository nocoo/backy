import { NextResponse } from "next/server";
import { getProject, updateProject, deleteProject } from "@/lib/db/projects";
import { validateAllowedIps, normalizeAllowedIps } from "@/lib/ip";
import { isUrlSafe } from "@/lib/url";
import { z } from "zod";

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  allowed_ips: z.string().max(2000).nullable().optional(),
  category_id: z.string().nullable().optional(),
  auto_backup_enabled: z.number().int().min(0).max(1).optional(),
  auto_backup_interval: z.number().int().refine((v) => [1, 12, 24].includes(v), { message: "Interval must be 1, 12, or 24" }).optional(),
  auto_backup_webhook: z.string().url().max(2000).nullable().optional(),
  auto_backup_header_key: z.string().max(200).nullable().optional(),
  auto_backup_header_value: z.string().max(2000).nullable().optional(),
});

/**
 * GET /api/projects/[id] — Get a single project.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const project = await getProject(id);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("Failed to get project:", error);
    return NextResponse.json(
      { error: "Failed to get project" },
      { status: 500 },
    );
  }
}

/**
 * PUT /api/projects/[id] — Update a project.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const body: unknown = await request.json();
    const parsed = UpdateProjectSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid input", details: parsed.error.flatten() },
        { status: 400 },
      );
    }

    // Validate and normalize allowed_ips if provided
    const updateData: Parameters<typeof updateProject>[1] = {
      name: parsed.data.name,
      description: parsed.data.description,
    };

    if (parsed.data.category_id !== undefined) {
      updateData.category_id = parsed.data.category_id;
    }

    if (parsed.data.allowed_ips !== undefined) {
      if (parsed.data.allowed_ips === null || parsed.data.allowed_ips.trim() === "") {
        updateData.allowed_ips = null;
      } else {
        const validation = validateAllowedIps(parsed.data.allowed_ips);
        if (!validation.valid) {
          return NextResponse.json(
            { error: "Invalid IP/CIDR format", invalid: validation.invalid },
            { status: 400 },
          );
        }
        updateData.allowed_ips = normalizeAllowedIps(parsed.data.allowed_ips);
      }
    }

    // Auto-backup fields
    if (parsed.data.auto_backup_enabled !== undefined) {
      updateData.auto_backup_enabled = parsed.data.auto_backup_enabled;
    }
    if (parsed.data.auto_backup_interval !== undefined) {
      updateData.auto_backup_interval = parsed.data.auto_backup_interval;
    }
    if (parsed.data.auto_backup_webhook !== undefined) {
      if (parsed.data.auto_backup_webhook !== null && !isUrlSafe(parsed.data.auto_backup_webhook)) {
        return NextResponse.json(
          { error: "Webhook URL is not allowed (must be HTTPS, public hostname)" },
          { status: 400 },
        );
      }
      updateData.auto_backup_webhook = parsed.data.auto_backup_webhook;
    }
    if (parsed.data.auto_backup_header_key !== undefined) {
      updateData.auto_backup_header_key = parsed.data.auto_backup_header_key;
    }
    if (parsed.data.auto_backup_header_value !== undefined) {
      updateData.auto_backup_header_value = parsed.data.auto_backup_header_value;
    }

    const project = await updateProject(id, updateData);

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json(project);
  } catch (error) {
    console.error("Failed to update project:", error);
    return NextResponse.json(
      { error: "Failed to update project" },
      { status: 500 },
    );
  }
}

/**
 * DELETE /api/projects/[id] — Delete a project.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const deleted = await deleteProject(id);

    if (!deleted) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return NextResponse.json(
      { error: "Failed to delete project" },
      { status: 500 },
    );
  }
}
