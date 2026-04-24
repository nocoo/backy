import { describe, expect, test } from "bun:test";
import { Folder, FolderKanban } from "lucide-react";
import {
  CATEGORY_ICONS,
  CATEGORY_COLORS,
  getCategoryIcon,
} from "../lib/category-icons";
import { ProjectsPage } from "../pages/projects";
import { ProjectNewPage } from "../pages/project-new";
import { ProjectDetailPage } from "../pages/project-detail";
import { CategoryManagement } from "../components/category-management";
import { ManualUploadDialog } from "../components/manual-upload-dialog";
import { ProjectWebhookPanel } from "../components/project/project-webhook-panel";
import { ProjectRecentBackupsCard } from "../components/project/project-recent-backups-card";

describe("category-icons", () => {
  test("CATEGORY_ICONS has 20 entries", () => {
    expect(CATEGORY_ICONS.length).toBe(20);
  });

  test("CATEGORY_COLORS has 10 entries", () => {
    expect(CATEGORY_COLORS.length).toBe(10);
    for (const c of CATEGORY_COLORS) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  test("getCategoryIcon resolves a known name", () => {
    expect(getCategoryIcon("folder-kanban")).toBe(FolderKanban);
  });

  test("getCategoryIcon falls back to Folder for unknown name", () => {
    expect(getCategoryIcon("not-a-real-icon")).toBe(Folder);
  });
});

describe("Projects page surface", () => {
  test("ProjectsPage is a function component", () => {
    expect(typeof ProjectsPage).toBe("function");
  });

  test("ProjectNewPage is a function component", () => {
    expect(typeof ProjectNewPage).toBe("function");
  });

  test("ProjectDetailPage is a function component", () => {
    expect(typeof ProjectDetailPage).toBe("function");
  });
});

describe("Project sub-components surface", () => {
  test("CategoryManagement is a function component", () => {
    expect(typeof CategoryManagement).toBe("function");
  });

  test("ManualUploadDialog is a function component", () => {
    expect(typeof ManualUploadDialog).toBe("function");
  });

  test("ProjectWebhookPanel is a function component", () => {
    expect(typeof ProjectWebhookPanel).toBe("function");
  });

  test("ProjectRecentBackupsCard is a function component", () => {
    expect(typeof ProjectRecentBackupsCard).toBe("function");
  });
});
