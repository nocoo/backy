"use client";

import { useEffect, useState, useCallback, useMemo, createElement } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, FolderKanban, Loader2, Folder } from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { CategoryManagement } from "@/components/category-management";
import { getCategoryIcon } from "@/lib/category-icons";

interface Project {
  id: string;
  name: string;
  description: string | null;
  webhook_token: string;
  category_id: string | null;
  created_at: string;
  updated_at: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
}

interface CategoryGroup {
  category: Category | null;
  projects: Project[];
}

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState<Project[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [projectsRes, categoriesRes] = await Promise.all([
        fetch("/api/projects"),
        fetch("/api/categories"),
      ]);
      if (!projectsRes.ok) throw new Error("Failed to fetch projects");
      const projectsData: Project[] = await projectsRes.json();
      setProjects(projectsData);

      if (categoriesRes.ok) {
        const categoriesData: Category[] = await categoriesRes.json();
        setCategories(categoriesData);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  // Group projects by category
  const groups = useMemo((): CategoryGroup[] => {
    if (categories.length === 0) {
      // No categories exist — show flat list as uncategorized
      return projects.length > 0 ? [{ category: null, projects }] : [];
    }

    const categoryMap = new Map<string, Category>();
    for (const cat of categories) {
      categoryMap.set(cat.id, cat);
    }

    const grouped = new Map<string | null, Project[]>();

    for (const project of projects) {
      const key = project.category_id && categoryMap.has(project.category_id)
        ? project.category_id
        : null;
      const list = grouped.get(key);
      if (list) {
        list.push(project);
      } else {
        grouped.set(key, [project]);
      }
    }

    const result: CategoryGroup[] = [];

    // Categorized groups first (in sort_order)
    for (const cat of categories) {
      const catProjects = grouped.get(cat.id);
      if (catProjects && catProjects.length > 0) {
        result.push({ category: cat, projects: catProjects });
      }
    }

    // Uncategorized last
    const uncategorized = grouped.get(null);
    if (uncategorized && uncategorized.length > 0) {
      result.push({ category: null, projects: uncategorized });
    }

    return result;
  }, [projects, categories]);

  return (
    <AppShell breadcrumbs={[{ label: "Projects" }]}>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Projects</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your backup projects and webhook tokens
            </p>
          </div>
          <div className="flex items-center gap-2">
            <CategoryManagement onCategoriesChanged={() => void fetchData()} />
            <Button onClick={() => router.push("/projects/new")} size="sm">
              <Plus className="h-4 w-4 mr-1.5" />
              New Project
            </Button>
          </div>
        </div>

        {/* Content */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={() => void fetchData()}
            >
              Retry
            </Button>
          </div>
        ) : projects.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/50 p-12 text-center">
            <FolderKanban className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              No projects yet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Create your first project to start receiving backups from AI
              agents.
            </p>
            <Button
              size="sm"
              className="mt-4"
              onClick={() => router.push("/projects/new")}
            >
              <Plus className="h-4 w-4 mr-1.5" />
              Create Project
            </Button>
          </div>
        ) : (
          <div className="flex flex-col gap-6">
            {groups.map((group) => {
              const key = group.category?.id ?? "__uncategorized__";
              return (
                <CategorySection
                  key={key}
                  group={group}
                  showHeader={categories.length > 0}
                />
              );
            })}
          </div>
        )}
      </div>
    </AppShell>
  );
}

function CategorySection({
  group,
  showHeader,
}: {
  group: CategoryGroup;
  showHeader: boolean;
}) {
  const { category, projects } = group;

  return (
    <div className="flex flex-col gap-2">
      {showHeader && (
        <div className="flex items-center gap-2 px-1">
          {category ? (
            <>
              {createElement(getCategoryIcon(category.icon), {
                className: "h-3.5 w-3.5",
                style: { color: category.color },
              })}
              <span className="text-sm font-medium" style={{ color: category.color }}>
                {category.name}
              </span>
              <span className="text-xs text-muted-foreground">
                ({projects.length})
              </span>
            </>
          ) : (
            <>
              <Folder className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-sm font-medium text-muted-foreground">
                Uncategorized
              </span>
              <span className="text-xs text-muted-foreground">
                ({projects.length})
              </span>
            </>
          )}
        </div>
      )}
      <div className="grid grid-cols-1 gap-1.5">
        {projects.map((project) => (
          <ProjectCard
            key={project.id}
            project={project}
            categoryColor={category?.color}
          />
        ))}
      </div>
    </div>
  );
}

function ProjectCard({
  project,
  categoryColor,
}: {
  project: Project;
  categoryColor?: string | undefined;
}) {
  const createdAt = new Date(project.created_at).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3.5 transition-colors hover:bg-accent/50"
    >
      <div className="flex items-center gap-3 min-w-0">
        {categoryColor ? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{ backgroundColor: `${categoryColor}15`, color: categoryColor }}
          >
            <FolderKanban className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <FolderKanban className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-foreground truncate">
            {project.name}
          </p>
          {project.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 ml-4">
        <p className="text-xs text-muted-foreground">{createdAt}</p>
      </div>
    </Link>
  );
}
