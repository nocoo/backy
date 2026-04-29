import { describe, expect, test } from "vitest";
import { sanitizeProject } from "@backy/api/sanitize";
import { makeProject } from "./helpers";

describe("sanitizeProject", () => {
  test("strips webhook_token", () => {
    const project = makeProject({ webhook_token: "secret-tok" });
    const safe = sanitizeProject(project);
    expect("webhook_token" in safe).toBe(false);
  });

  test("strips auto_backup_header_key", () => {
    const project = makeProject({ auto_backup_header_key: "X-Secret" });
    const safe = sanitizeProject(project);
    expect("auto_backup_header_key" in safe).toBe(false);
  });

  test("strips auto_backup_header_value", () => {
    const project = makeProject({ auto_backup_header_value: "Bearer xyz" });
    const safe = sanitizeProject(project);
    expect("auto_backup_header_value" in safe).toBe(false);
  });

  test("exposes only the allowlist of safe fields (positive contract)", () => {
    // Adds a positive contract on top of the 3 negative 'strips X'
    // tests above. The 3 negative tests pass even if other sensitive
    // fields are added later (toBe(false) only checks one key); this
    // test pins the EXACT allowlist of exposed keys via sorted toEqual.
    // A regression that adds a new sensitive field without sanitizing
    // it would surface here as an unexpected key in the diff.
    const project = makeProject({
      webhook_token: "tok",
      auto_backup_header_key: "X-K",
      auto_backup_header_value: "V",
    });
    const safe = sanitizeProject(project);
    expect(Object.keys(safe).sort()).toEqual([
      "allowed_ips",
      "auto_backup_enabled",
      "auto_backup_headers_configured",
      "auto_backup_interval",
      "auto_backup_webhook",
      "category_id",
      "created_at",
      "description",
      "id",
      "name",
      "updated_at",
    ]);
  });

  test("preserves non-sensitive fields", () => {
    const project = makeProject({
      id: "proj-1",
      name: "My Project",
      description: "A description",
      allowed_ips: "10.0.0.0/8",
      category_id: "cat-1",
      auto_backup_enabled: 1,
      auto_backup_interval: 12,
      auto_backup_webhook: "https://example.com/backup",
    });
    const safe = sanitizeProject(project);

    expect(safe.id).toBe("proj-1");
    expect(safe.name).toBe("My Project");
    expect(safe.description).toBe("A description");
    expect(safe.allowed_ips).toBe("10.0.0.0/8");
    expect(safe.category_id).toBe("cat-1");
    expect(safe.auto_backup_enabled).toBe(1);
    expect(safe.auto_backup_interval).toBe(12);
    expect(safe.auto_backup_webhook).toBe("https://example.com/backup");
    // sanitizeProject must preserve timestamps verbatim from the source row
    // (no rounding / regeneration). makeProject pins them to a fixed value.
    expect(safe.created_at).toBe("2026-01-01T00:00:00.000Z");
    expect(safe.updated_at).toBe("2026-01-01T00:00:00.000Z");
  });

  test("does not mutate the original object", () => {
    const project = makeProject({ webhook_token: "original-token" });
    sanitizeProject(project);
    expect(project.webhook_token).toBe("original-token");
  });
});
