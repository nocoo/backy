import { useEffect, useState, useCallback, useRef } from "react";
import { Link, useSearchParams } from "react-router";
import {
  Archive,
  Download,
  Trash2,
  Loader2,
  Eye,
  Search,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
} from "@nocoo/basalt/icons";
import { toast } from "@nocoo/basalt/components/toast";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@nocoo/basalt/components/button";
import { Badge } from "@nocoo/basalt/components/badge";
import { Input } from "@nocoo/basalt/components/input";
import { Checkbox } from "@nocoo/basalt/components/checkbox";
import { SkeletonLine as Skeleton } from "@nocoo/basalt/components/skeleton-line";
import { ManualUploadDialog } from "@/components/manual-upload-dialog";
import { PageHeader } from "@nocoo/basalt/components/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@nocoo/basalt/components/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nocoo/basalt/components/dialog";

interface BackupWithProject {
  id: string;
  project_id: string;
  project_name: string;
  environment: string | null;
  sender_ip: string;
  tag: string | null;
  file_key: string;
  json_key: string | null;
  file_size: number;
  is_single_json: number;
  json_extracted: number;
  file_type: string;
  created_at: string;
  updated_at: string;
}

interface PaginatedResponse {
  items: BackupWithProject[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  environments: string[];
  projects: Array<{ id: string; name: string }>;
}

type SortBy = "created_at" | "file_size" | "project_name";
type SortOrder = "asc" | "desc";

const FILE_TYPE_LABELS: Record<string, string> = {
  json: "JSON",
  zip: "ZIP",
  gz: "GZ",
  tgz: "TGZ",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string } | null;
    return body?.error ?? `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

const PAGE_SIZE = 20;

export function BackupsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const projectFilter = searchParams.get("projectId")?.trim() || "all";
  const [envFilter, setEnvFilter] = useState<string>("all");

  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  const [page, setPage] = useState(1);

  const [selected, setSelected] = useState<Set<string>>(new Set());

  const [deleteTarget, setDeleteTarget] = useState<BackupWithProject | null>(
    null,
  );
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  useEffect(() => {
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      params.set("sortBy", sortBy);
      params.set("sortOrder", sortOrder);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (projectFilter !== "all") params.set("projectId", projectFilter);
      if (envFilter !== "all") params.set("environment", envFilter);

      const res = await apiFetch(`/api/backups?${params.toString()}`);
      const result = (await res.json()) as PaginatedResponse;
      setData(result);
    } catch (err) {
      setError(errorMessage(err, "Failed to fetch backups"));
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, debouncedSearch, projectFilter, envFilter]);

  useEffect(() => {
    void fetchBackups();
  }, [fetchBackups]);

  // Clear multi-select when list data changes (page/filter/sort/refresh).
  // biome-ignore lint/correctness/useExhaustiveDependencies: data is the intentional trigger
  useEffect(() => {
    setSelected(new Set());
  }, [data]);

  function handleSort(column: SortBy) {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "desc" ? "asc" : "desc"));
    } else {
      setSortBy(column);
      setSortOrder("desc");
    }
    setPage(1);
  }

  function handleSelectAll(checked: boolean) {
    if (checked && data) {
      setSelected(new Set(data.items.map((b) => b.id)));
    } else {
      setSelected(new Set());
    }
  }

  function handleSelectOne(id: string, checked: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (checked) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  async function handleDownload(backup: BackupWithProject) {
    try {
      setDownloading(backup.id);
      const res = await apiFetch(`/api/backups/${backup.id}/download`);
      const result = (await res.json()) as { url: string };
      window.open(result.url, "_blank");
    } catch (err) {
      toast.error(errorMessage(err, "Download failed"));
    } finally {
      setDownloading(null);
    }
  }

  async function handleDeleteSingle() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      await apiFetch(`/api/backups/${deleteTarget.id}`, { method: "DELETE" });
      setDeleteTarget(null);
      toast.success("Backup deleted");
      await fetchBackups();
    } catch (err) {
      toast.error(errorMessage(err, "Delete failed"));
    } finally {
      setDeleting(false);
    }
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return;
    try {
      setDeleting(true);
      await apiFetch("/api/backups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      setBatchDeleteOpen(false);
      const count = selected.size;
      setSelected(new Set());
      toast.success(`${count} backup${count !== 1 ? "s" : ""} deleted`);
      await fetchBackups();
    } catch (err) {
      toast.error(errorMessage(err, "Batch delete failed"));
    } finally {
      setDeleting(false);
    }
  }

  function setProjectFilter(value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (!value || value === "all") next.delete("projectId");
        else next.set("projectId", value);
        return next;
      },
      { replace: true },
    );
  }

  function handleFilterChange(type: "project" | "env", value: string) {
    if (type === "project") setProjectFilter(value);
    else setEnvFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setSearch("");
    setDebouncedSearch("");
    setProjectFilter("all");
    setEnvFilter("all");
    setSortBy("created_at");
    setSortOrder("desc");
    setPage(1);
  }

  const hasFilters =
    debouncedSearch !== "" || projectFilter !== "all" || envFilter !== "all";
  const allSelected =
    data !== null &&
    data.items.length > 0 &&
    selected.size === data.items.length;
  const someSelected = selected.size > 0 && !allSelected;

  const sortIcon = (column: SortBy) => {
    if (sortBy !== column)
      return <ArrowUpDown className="h-3 w-3 text-basalt-muted-foreground/50" />;
    return sortOrder === "desc" ? (
      <ArrowDown className="h-3 w-3 text-basalt-primary" />
    ) : (
      <ArrowUp className="h-3 w-3 text-basalt-primary" />
    );
  };

  function getSortAriaLabel(column: SortBy, label: string): string {
    if (sortBy !== column) return `${label}, not sorted`;
    return sortOrder === "desc"
      ? `${label}, sorted descending`
      : `${label}, sorted ascending`;
  }

  return (
    <div className="relative flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="Backups"
        description={data ? `${data.total} backup${data.total !== 1 ? "s" : ""} total` : "Loading..."}
        actions={selected.size > 0 ? (
          <>
            <span className="text-basalt-sm text-basalt-muted-foreground">{selected.size} selected</span>
            <Button variant="destructive" size="sm" onClick={() => setBatchDeleteOpen(true)}>
              <Trash2 className="mr-basalt-space-md h-3.5 w-3.5" />Delete Selected
            </Button>
            <Button variant="outline" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
          </>
        ) : <ManualUploadDialog onSuccess={() => void fetchBackups()} />}
      />

      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-basalt-muted-foreground" />
          <Input
            placeholder="Search by project, tag, or ID..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8 h-9 text-sm"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-basalt-muted-foreground hover:text-basalt-foreground"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>

        {data && data.projects.length > 0 && (
          <Select
            value={projectFilter}
            onValueChange={(v) => handleFilterChange("project", v)}
          >
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {data.projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {data && data.environments.length > 0 && (
          <Select
            value={envFilter}
            onValueChange={(v) => handleFilterChange("env", v)}
          >
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="All Environments" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Environments</SelectItem>
              {data.environments.map((env) => (
                <SelectItem key={env} value={env}>
                  {env}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        {hasFilters && (
          <Button
            variant="ghost"
            size="sm"
            onClick={clearFilters}
            className="h-9 text-xs text-basalt-muted-foreground"
          >
            <X className="h-3 w-3 mr-1" />
            Clear filters
          </Button>
        )}
      </div>

      {loading && !data ? (
        <BackupsListSkeleton />
      ) : error && !data ? (
        <div className="rounded-lg border border-basalt-destructive/30 bg-basalt-destructive/5 p-6 text-center">
          <p className="text-sm text-basalt-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => void fetchBackups()}
          >
            Retry
          </Button>
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-lg border border-basalt-border bg-basalt-background/50 p-12 text-center">
          <Archive className="h-10 w-10 text-basalt-muted-foreground/40 mx-auto mb-3" />
          <p className="text-sm font-medium text-basalt-foreground">
            {hasFilters ? "No backups match your filters" : "No backups yet"}
          </p>
          <p className="text-sm text-basalt-muted-foreground mt-1">
            {hasFilters
              ? "Try adjusting your search or filters."
              : "Configure your AI agent to send backups via webhook."}
          </p>
          {hasFilters && (
            <Button
              variant="outline"
              size="sm"
              className="mt-3"
              onClick={clearFilters}
            >
              Clear filters
            </Button>
          )}
        </div>
      ) : data ? (
        <>
          <div className="hidden md:flex items-center gap-3 px-4 py-2 text-xs text-basalt-muted-foreground border-b border-basalt-border">
            <div className="w-5 shrink-0">
              <Checkbox
                checked={
                  allSelected
                    ? true
                    : someSelected
                      ? "indeterminate"
                      : false
                }
                onCheckedChange={(checked) =>
                  handleSelectAll(checked === true)
                }
                aria-label="Select all backups on this page"
              />
            </div>
            <div className="w-9 shrink-0" />
            <div className="min-w-0 flex-1">
              <button
                type="button"
                className="flex items-center gap-1 hover:text-basalt-foreground transition-colors cursor-pointer"
                onClick={() => handleSort("project_name")}
                aria-label={getSortAriaLabel("project_name", "Project")}
              >
                Project {sortIcon("project_name")}
              </button>
            </div>
            <div className="w-[140px] shrink-0">
              <button
                type="button"
                className="flex items-center gap-1 hover:text-basalt-foreground transition-colors cursor-pointer"
                onClick={() => handleSort("created_at")}
                aria-label={getSortAriaLabel("created_at", "Date")}
              >
                Date {sortIcon("created_at")}
              </button>
            </div>
            <div className="w-[80px] shrink-0">
              <button
                type="button"
                className="flex items-center gap-1 hover:text-basalt-foreground transition-colors cursor-pointer"
                onClick={() => handleSort("file_size")}
                aria-label={getSortAriaLabel("file_size", "Size")}
              >
                Size {sortIcon("file_size")}
              </button>
            </div>
            <div className="w-[110px] shrink-0" />
          </div>

          <div className="flex flex-col gap-1">
            {data.items.map((backup) => (
              <div
                key={backup.id}
                className={`flex flex-col gap-3 rounded-lg border px-4 py-3 transition-colors md:flex-row md:items-center ${
                  selected.has(backup.id)
                    ? "border-basalt-primary/40 bg-basalt-primary/5"
                    : "border-basalt-border bg-basalt-background/50"
                }`}
              >
                <div className="flex items-start gap-3 min-w-0 flex-1 md:items-center">
                  <div className="w-5 shrink-0 pt-2 md:pt-0">
                    <Checkbox
                      checked={selected.has(backup.id)}
                      onCheckedChange={(checked) =>
                        handleSelectOne(backup.id, checked === true)
                      }
                    />
                  </div>

                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-basalt-primary/10 text-basalt-primary">
                    <Archive className="h-4 w-4" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        to={`/projects/${backup.project_id}`}
                        className="text-sm font-medium text-basalt-foreground hover:underline"
                      >
                        {backup.project_name}
                      </Link>
                      {backup.environment && (
                        <Badge variant="secondary">
                          {backup.environment}
                        </Badge>
                      )}
                      {backup.tag && (
                        <Badge variant="outline">{backup.tag}</Badge>
                      )}
                      {backup.file_type && (
                        <Badge
                          variant={
                            backup.file_type === "json" ? "default" : "secondary"
                          }
                        >
                          {FILE_TYPE_LABELS[backup.file_type] ??
                            backup.file_type.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-basalt-muted-foreground md:hidden">
                      <span>{formatDate(backup.created_at)}</span>
                      <span>{formatBytes(backup.file_size)}</span>
                    </div>
                    <span className="text-xs text-basalt-muted-foreground/60 font-mono">
                      {backup.id.slice(0, 8)}
                    </span>
                  </div>
                </div>

                <div className="hidden w-[140px] shrink-0 md:block">
                  <span className="text-xs text-basalt-muted-foreground">
                    {formatDate(backup.created_at)}
                  </span>
                </div>

                <div className="hidden w-[80px] shrink-0 md:block">
                  <span className="text-xs text-basalt-muted-foreground">
                    {formatBytes(backup.file_size)}
                  </span>
                </div>

                <div className="flex items-center justify-end gap-1 border-t border-basalt-border/60 pt-3 md:w-[110px] md:shrink-0 md:justify-end md:border-t-0 md:pt-0">
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      to={`/backups/${backup.id}`}
                      aria-label={`View backup ${backup.id.slice(0, 8)}`}
                    >
                      <Eye className="h-3.5 w-3.5" />
                    </Link>
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Download backup ${backup.id.slice(0, 8)}`}
                    onClick={() => void handleDownload(backup)}
                    disabled={downloading === backup.id}
                  >
                    {downloading === backup.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Download className="h-3.5 w-3.5" />
                    )}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label={`Delete backup ${backup.id.slice(0, 8)}`}
                    onClick={() => setDeleteTarget(backup)}
                  >
                    <Trash2 className="h-3.5 w-3.5 text-basalt-destructive" />
                  </Button>
                </div>
              </div>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-basalt-muted-foreground">
                Page {data.page} of {data.totalPages}
                {" · "}
                {data.total} backup{data.total !== 1 ? "s" : ""}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                {generatePageNumbers(data.page, data.totalPages).map((p, i) =>
                  p === "..." ? (
                    <span
                      key={`ellipsis-${i}`}
                      className="px-2 text-xs text-basalt-muted-foreground"
                    >
                      ...
                    </span>
                  ) : (
                    <Button
                      key={p}
                      variant={p === page ? "default" : "outline"}
                      size="sm"
                      onClick={() => setPage(p)}
                      disabled={loading}
                      className="min-w-[32px]"
                    >
                      {p}
                    </Button>
                  ),
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    setPage((p) => Math.min(data.totalPages, p + 1))
                  }
                  disabled={page >= data.totalPages || loading}
                >
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </>
      ) : null}

      {loading && data && (
        <div className="absolute inset-0 flex items-center justify-center bg-basalt-background/50 rounded-lg">
          <Loader2 className="h-5 w-5 animate-spin text-basalt-muted-foreground" />
        </div>
      )}

      <Dialog
        open={!!deleteTarget}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Backup?</DialogTitle>
            <DialogDescription>
              This will permanently delete this backup file from storage. This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDeleteTarget(null)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleDeleteSingle()}
              disabled={deleting}
            >
              {deleting && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={batchDeleteOpen}
        onOpenChange={(open) => !open && setBatchDeleteOpen(false)}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete {selected.size} Backups?</DialogTitle>
            <DialogDescription>
              This will permanently delete {selected.size} backup
              {selected.size !== 1 ? "s" : ""} and their files from storage.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setBatchDeleteOpen(false)}
              disabled={deleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleBatchDelete()}
              disabled={deleting}
            >
              {deleting && (
                <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />
              )}
              Delete {selected.size} Backup{selected.size !== 1 ? "s" : ""}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function generatePageNumbers(
  current: number,
  total: number,
): Array<number | "..."> {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: Array<number | "..."> = [1];

  if (current > 3) pages.push("...");

  const start = Math.max(2, current - 1);
  const end = Math.min(total - 1, current + 1);

  for (let i = start; i <= end; i++) {
    pages.push(i);
  }

  if (current < total - 2) pages.push("...");

  pages.push(total);

  return pages;
}

function BackupsListSkeleton() {
  return (
    <>
      <div className="hidden md:flex items-center gap-3 px-4 py-2 border-b border-basalt-border">
        <Skeleton className="w-5 h-4" />
        <Skeleton className="w-9 h-4" />
        <Skeleton className="flex-1 h-4 max-w-[80px]" />
        <Skeleton className="w-[140px] h-4" />
        <Skeleton className="w-[80px] h-4" />
        <Skeleton className="w-[110px] h-4" />
      </div>

      <div className="flex flex-col gap-1">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-basalt-border bg-basalt-background/50 px-4 py-3 md:flex-row md:items-center"
          >
            <div className="flex items-start gap-3 min-w-0 flex-1 md:items-center">
              <Skeleton className="w-5 h-4 shrink-0 mt-2 md:mt-0" />
              <Skeleton className="h-9 w-9 shrink-0 rounded-lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-5 w-14 rounded-full" />
                  <Skeleton className="h-5 w-10 rounded-full" />
                </div>
                <Skeleton className="h-3 w-16 mt-1.5" />
              </div>
            </div>
            <Skeleton className="hidden md:block w-[140px] h-3" />
            <Skeleton className="hidden md:block w-[80px] h-3" />
            <div className="flex items-center gap-1 border-t border-basalt-border/60 pt-3 md:w-[110px] md:border-t-0 md:pt-0">
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
              <Skeleton className="h-8 w-8 rounded" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
