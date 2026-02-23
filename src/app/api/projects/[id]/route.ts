import { NextResponse } from "next/server";
import { getProject, updateProject, deleteProject } from "@/lib/db/projects";
import { validateAllowedIps, normalizeAllowedIps } from "@/lib/ip";
import { z } from "zod";

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  allowed_ips: z.string().max(2000).nullable().optional(),
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
    const updateData: { name?: string | undefined; description?: string | undefined; allowed_ips?: string | null | undefined } = {
      name: parsed.data.name,
      description: parsed.data.description,
    };

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
