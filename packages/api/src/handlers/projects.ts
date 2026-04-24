import { z } from "zod";
import {
  listProjects,
  createProject,
  getProject,
  updateProject,
  deleteProject,
  regenerateToken,
} from "../lib/db/projects";
import { sanitizeProject } from "../lib/sanitize";
import { validateAllowedIps, normalizeAllowedIps } from "../lib/ip";
import { isUrlSafe } from "../lib/url";
import { json, type HandlerResponse } from "../http/response";
import { buildPromptMarkdown } from "./projects-prompt";
import type { RuntimeContext } from "../runtime";

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().max(500).optional(),
});

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional(),
  allowed_ips: z.string().max(2000).nullable().optional(),
  category_id: z.string().nullable().optional(),
  auto_backup_enabled: z.number().int().min(0).max(1).optional(),
  auto_backup_interval: z
    .number()
    .int()
    .refine((v) => [1, 12, 24].includes(v), {
      message: "Interval must be 1, 12, or 24",
    })
    .optional(),
  auto_backup_webhook: z.string().url().max(2000).nullable().optional(),
  auto_backup_header_key: z.string().max(200).nullable().optional(),
  auto_backup_header_value: z.string().max(2000).nullable().optional(),
});

export async function listProjectsHandler(
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const projects = await listProjects(ctx.db);
    return json(200, projects.map(sanitizeProject));
  } catch (error) {
    console.error("Failed to list projects:", error);
    return json(500, { error: "Failed to list projects" });
  }
}

export async function createProjectHandler(
  input: { body: unknown },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const parsed = CreateProjectSchema.safeParse(input.body);
    if (!parsed.success) {
      return json(400, {
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }
    const project = await createProject(
      ctx.db,
      parsed.data.name,
      parsed.data.description,
    );
    return json(201, project);
  } catch (error) {
    console.error("Failed to create project:", error);
    return json(500, { error: "Failed to create project" });
  }
}

export async function getProjectHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const project = await getProject(ctx.db, input.id);
    if (!project) return json(404, { error: "Project not found" });
    return json(200, sanitizeProject(project));
  } catch (error) {
    console.error("Failed to get project:", error);
    return json(500, { error: "Failed to get project" });
  }
}

export async function updateProjectHandler(
  input: { id: string; body: unknown },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const parsed = UpdateProjectSchema.safeParse(input.body);
    if (!parsed.success) {
      return json(400, {
        error: "Invalid input",
        details: parsed.error.flatten(),
      });
    }

    const updateData: Parameters<typeof updateProject>[2] = {
      name: parsed.data.name,
      description: parsed.data.description,
    };

    if (parsed.data.category_id !== undefined) {
      updateData.category_id = parsed.data.category_id;
    }

    if (parsed.data.allowed_ips !== undefined) {
      if (
        parsed.data.allowed_ips === null ||
        parsed.data.allowed_ips.trim() === ""
      ) {
        updateData.allowed_ips = null;
      } else {
        const validation = validateAllowedIps(parsed.data.allowed_ips);
        if (!validation.valid) {
          return json(400, {
            error: "Invalid IP/CIDR format",
            invalid: validation.invalid,
          });
        }
        updateData.allowed_ips = normalizeAllowedIps(parsed.data.allowed_ips);
      }
    }

    if (parsed.data.auto_backup_enabled !== undefined) {
      updateData.auto_backup_enabled = parsed.data.auto_backup_enabled;
    }
    if (parsed.data.auto_backup_interval !== undefined) {
      updateData.auto_backup_interval = parsed.data.auto_backup_interval;
    }
    if (parsed.data.auto_backup_webhook !== undefined) {
      if (
        parsed.data.auto_backup_webhook !== null &&
        !isUrlSafe(parsed.data.auto_backup_webhook, ctx.env)
      ) {
        return json(400, {
          error:
            "Webhook URL is not allowed (must be HTTPS, public hostname)",
        });
      }
      updateData.auto_backup_webhook = parsed.data.auto_backup_webhook;
    }
    if (parsed.data.auto_backup_header_key !== undefined) {
      updateData.auto_backup_header_key = parsed.data.auto_backup_header_key;
    }
    if (parsed.data.auto_backup_header_value !== undefined) {
      updateData.auto_backup_header_value =
        parsed.data.auto_backup_header_value;
    }

    const project = await updateProject(ctx.db, input.id, updateData);
    if (!project) return json(404, { error: "Project not found" });
    return json(200, sanitizeProject(project));
  } catch (error) {
    console.error("Failed to update project:", error);
    return json(500, { error: "Failed to update project" });
  }
}

export async function deleteProjectHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const deleted = await deleteProject(ctx.db, input.id);
    if (!deleted) return json(404, { error: "Project not found" });
    return json(200, { success: true });
  } catch (error) {
    console.error("Failed to delete project:", error);
    return json(500, { error: "Failed to delete project" });
  }
}

export async function regenerateTokenHandler(
  input: { id: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const token = await regenerateToken(ctx.db, input.id);
    if (!token) return json(404, { error: "Project not found" });
    return json(200, { webhook_token: token });
  } catch (error) {
    console.error("Failed to regenerate token:", error);
    return json(500, { error: "Failed to regenerate token" });
  }
}

export async function projectPromptHandler(
  input: { id: string; baseUrl: string },
  ctx: RuntimeContext,
): Promise<HandlerResponse> {
  try {
    const project = await getProject(ctx.db, input.id);
    if (!project) return json(404, { error: "Project not found" });
    const prompt = buildPromptMarkdown(project, input.baseUrl);
    return json(200, { prompt });
  } catch (error) {
    console.error("Failed to generate prompt:", error);
    return json(500, { error: "Failed to generate prompt" });
  }
}
