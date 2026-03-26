/**
 * Strip sensitive credentials from project records before sending to clients.
 *
 * Internal callers (prompt generation, webhook validation, cron trigger)
 * still use full Project objects from `getProject()` directly.
 */

import type { Project } from "@/lib/db/projects";

/** Fields that must never be exposed via public-facing API responses. */
type SensitiveField = "webhook_token" | "auto_backup_header_key" | "auto_backup_header_value";

/**
 * Sanitized project type - sensitive fields removed, but includes
 * `auto_backup_headers_configured` boolean to indicate presence without exposure.
 */
export type SanitizedProject = Omit<Project, SensitiveField> & {
  auto_backup_headers_configured: boolean;
};

/**
 * Remove sensitive credentials from a project record.
 * Returns a new object — does not mutate the input.
 *
 * Adds `auto_backup_headers_configured: true` when headers are present,
 * allowing the UI to track dirty state without exposing actual values.
 */
export function sanitizeProject(project: Project): SanitizedProject {
  const hasHeaders =
    project.auto_backup_header_key !== null &&
    project.auto_backup_header_key.trim().length > 0 &&
    project.auto_backup_header_value !== null &&
    project.auto_backup_header_value.trim().length > 0;

  return {
    id: project.id,
    name: project.name,
    description: project.description,
    allowed_ips: project.allowed_ips,
    category_id: project.category_id,
    auto_backup_enabled: project.auto_backup_enabled,
    auto_backup_interval: project.auto_backup_interval,
    auto_backup_webhook: project.auto_backup_webhook,
    auto_backup_headers_configured: hasHeaders,
    created_at: project.created_at,
    updated_at: project.updated_at,
  };
}
