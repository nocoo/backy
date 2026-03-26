/**
 * Strip sensitive credentials from project records before sending to clients.
 *
 * Internal callers (prompt generation, webhook validation, cron trigger)
 * still use full Project objects from `getProject()` directly.
 */

import type { Project } from "@/lib/db/projects";

/** Fields that must never be exposed via public-facing API responses. */
type SensitiveField = "webhook_token" | "auto_backup_header_key" | "auto_backup_header_value";

export type SanitizedProject = Omit<Project, SensitiveField>;

/**
 * Remove sensitive credentials from a project record.
 * Returns a new object — does not mutate the input.
 */
export function sanitizeProject(project: Project): SanitizedProject {
  return {
    id: project.id,
    name: project.name,
    description: project.description,
    allowed_ips: project.allowed_ips,
    category_id: project.category_id,
    auto_backup_enabled: project.auto_backup_enabled,
    auto_backup_interval: project.auto_backup_interval,
    auto_backup_webhook: project.auto_backup_webhook,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}
