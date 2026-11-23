import { useMemo, createElement } from "react";
import useSWR from "swr";
import { Link, useNavigate } from "react-router";
import { Plus, FolderKanban, Folder } from "@nocoo/basalt/icons";
import { swrFetcher } from "@/lib/api";
import { Skeleton } from "@nocoo/basalt/components/skeleton";
import { Button } from "@nocoo/basalt/components/button";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import { CategoryManagement } from "@/components/category-management";
import { getCategoryIcon } from "@/lib/category-icons";

interface Project {
  id: string;
  name: string;
  description: string | null;
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

export function ProjectsPage() {
  const navigate = useNavigate();
  const projectsSwr = useSWR<Project[]>("/api/projects", swrFetcher);
  const categoriesSwr = useSWR<Category[]>("/api/categories", swrFetcher);

  const loading = projectsSwr.isLoading || categoriesSwr.isLoading;
  const error = projectsSwr.error
    ? projectsSwr.error instanceof Error
      ? projectsSwr.error.message
      : "Failed to load projects"
    : null;

  const projects = projectsSwr.data ?? [];
  const categories = categoriesSwr.data ?? [];

  const refresh = () => {
    void projectsSwr.mutate();
    void categoriesSwr.mutate();
  };

  const groups = useMemo((): CategoryGroup[] => {
    if (categories.length === 0) {
      return projects.length > 0 ? [{ category: null, projects }] : [];
    }

    const categoryMap = new Map<string, Category>();
    for (const cat of categories) {
      categoryMap.set(cat.id, cat);
    }

    const grouped = new Map<string | null, Project[]>();

    for (const project of projects) {
      const key =
        project.category_id && categoryMap.has(project.category_id)
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

    for (const cat of categories) {
      const catProjects = grouped.get(cat.id);
      if (catProjects && catProjects.length > 0) {
        result.push({ category: cat, projects: catProjects });
      }
    }

    const uncategorized = grouped.get(null);
    if (uncategorized && uncategorized.length > 0) {
      result.push({ category: null, projects: uncategorized });
    }

    return result;
  }, [projects, categories]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Projects"
        description="Manage your backup projects and webhook tokens"
        actions={
          <>
            <CategoryManagement onCategoriesChanged={refresh} />
            <Button onClick={() => navigate("/projects/new")} size="sm">
              <Plus className="mr-basalt-space-md h-4 w-4" />
              New Project
            </Button>
          </>
        }
      />

      {loading ? (
        <ProjectsListSkeleton />
      ) : error ? (
        <div className="rounded-lg border border-basalt-destructive/30 bg-basalt-destructive/5 p-6 text-center">
          <p className="text-sm text-basalt-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void projectsSwr.mutate()}
          >
            Retry
          </Button>
        </div>
      ) : projects.length === 0 ? (
        <div className="rounded-lg border border-basalt-border bg-basalt-background/50 p-12 text-center">
          <FolderKanban className="h-10 w-10 text-basalt-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-basalt-foreground">
            No projects yet
          </p>
          <p className="text-sm text-basalt-muted-foreground mt-1">
            Create your first project to start receiving backups from AI
            agents.
          </p>
          <Button
            size="sm"
            className="mt-4"
            onClick={() => navigate("/projects/new")}
          >
            <Plus className="h-4 w-4 mr-1.5" />
            Create Project
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-6">
          {groups.map((group, i) => {
            const key = group.category?.id ?? "__uncategorized__";
            return (
              <div
                key={key}
                className=""
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <CategorySection
                  group={group}
                  showHeader={categories.length > 0}
                />
              </div>
            );
          })}
        </div>
      )}
    </div>
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
              <span
                className="text-sm font-medium"
                style={{ color: category.color }}
              >
                {category.name}
              </span>
              <span className="text-xs text-basalt-muted-foreground">
                ({projects.length})
              </span>
            </>
          ) : (
            <>
              <Folder className="h-3.5 w-3.5 text-basalt-muted-foreground" />
              <span className="text-sm font-medium text-basalt-muted-foreground">
                Uncategorized
              </span>
              <span className="text-xs text-basalt-muted-foreground">
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
      to={`/projects/${project.id}`}
      className="group flex items-center justify-between rounded-lg border border-basalt-border bg-basalt-background/50 px-4 py-3.5 transition-colors hover:bg-basalt-accent/50"
    >
      <div className="flex items-center gap-3 min-w-0">
        {categoryColor ? (
          <div
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg"
            style={{
              backgroundColor: `${categoryColor}15`,
              color: categoryColor,
            }}
          >
            <FolderKanban className="h-4 w-4" />
          </div>
        ) : (
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-basalt-primary/10 text-basalt-primary">
            <FolderKanban className="h-4 w-4" />
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-medium text-basalt-foreground truncate">
            {project.name}
          </p>
          {project.description && (
            <p className="text-xs text-basalt-muted-foreground truncate mt-0.5">
              {project.description}
            </p>
          )}
        </div>
      </div>
      <div className="shrink-0 ml-4">
        <p className="text-xs text-basalt-muted-foreground">{createdAt}</p>
      </div>
    </Link>
  );
}

function ProjectsListSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {Array.from({ length: 2 }).map((_, groupIdx) => (
        <div key={groupIdx} className="flex flex-col gap-2">
          <div className="flex items-center gap-2 px-1">
            <Skeleton className="h-3.5 w-3.5 rounded" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-3 w-8" />
          </div>
          <div className="grid grid-cols-1 gap-1.5">
            {Array.from({ length: groupIdx === 0 ? 3 : 2 }).map(
              (_, cardIdx) => (
                <div
                  key={cardIdx}
                  className="flex items-center justify-between rounded-lg border border-basalt-border bg-basalt-background/50 px-4 py-3.5"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <Skeleton className="h-9 w-9 rounded-lg" />
                    <div className="min-w-0">
                      <Skeleton className="h-4 w-32 mb-1.5" />
                      <Skeleton className="h-3 w-48" />
                    </div>
                  </div>
                  <div className="shrink-0 ml-4">
                    <Skeleton className="h-3 w-20" />
                  </div>
                </div>
              ),
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
