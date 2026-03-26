import { describe, expect, test } from "bun:test";
import { sanitizeProject } from "@/lib/sanitize";
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
    expect(safe.created_at).toBeDefined();
    expect(safe.updated_at).toBeDefined();
  });

  test("does not mutate the original object", () => {
    const project = makeProject({ webhook_token: "original-token" });
    sanitizeProject(project);
    expect(project.webhook_token).toBe("original-token");
  });
});
