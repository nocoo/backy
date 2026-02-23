"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import Link from "next/link";
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
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

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

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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

const PAGE_SIZE = 20;

export default function BackupsPage() {
  // Data
  const [data, setData] = useState<PaginatedResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [envFilter, setEnvFilter] = useState<string>("all");

  // Sort
  const [sortBy, setSortBy] = useState<SortBy>("created_at");
  const [sortOrder, setSortOrder] = useState<SortOrder>("desc");

  // Pagination
  const [page, setPage] = useState(1);

  // Selection
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Actions
  const [deleteTarget, setDeleteTarget] = useState<BackupWithProject | null>(null);
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  // Debounce search
  const searchTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => {
    searchTimerRef.current = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1); // Reset to first page on search change
    }, 300);
    return () => clearTimeout(searchTimerRef.current);
  }, [search]);

  // Fetch backups
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

      const res = await fetch(`/api/backups?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch backups");
      const result: PaginatedResponse = await res.json();
      setData(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [page, sortBy, sortOrder, debouncedSearch, projectFilter, envFilter]);

  useEffect(() => {
    void fetchBackups();
  }, [fetchBackups]);

  // Clear selection when data changes
  useEffect(() => {
    setSelected(new Set());
  }, [data]);

  // --- Handlers ---

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
      const res = await fetch(`/api/backups/${backup.id}/download`);
      if (!res.ok) throw new Error("Failed to generate download URL");
      const result: { url: string } = await res.json();
      window.open(result.url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDeleteSingle() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/backups/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete backup");
      setDeleteTarget(null);
      toast.success("Backup deleted");
      await fetchBackups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeleting(false);
    }
  }

  async function handleBatchDelete() {
    if (selected.size === 0) return;
    try {
      setDeleting(true);
      const res = await fetch("/api/backups", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: Array.from(selected) }),
      });
      if (!res.ok) throw new Error("Failed to delete backups");
      setBatchDeleteOpen(false);
      setSelected(new Set());
      toast.success(`${selected.size} backup${selected.size !== 1 ? "s" : ""} deleted`);
      await fetchBackups();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Batch delete failed");
    } finally {
      setDeleting(false);
    }
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

  const hasFilters = debouncedSearch || projectFilter !== "all" || envFilter !== "all";
  const allSelected = data !== null && data.items.length > 0 && selected.size === data.items.length;
  const someSelected = selected.size > 0 && !allSelected;

  // Sort icon helper
  function SortIcon({ column }: { column: SortBy }) {
    if (sortBy !== column) return <ArrowUpDown className="h-3 w-3 text-muted-foreground/50" />;
    return sortOrder === "desc"
      ? <ArrowDown className="h-3 w-3 text-primary" />
      : <ArrowUp className="h-3 w-3 text-primary" />;
  }

  return (
    <AppShell breadcrumbs={[{ label: "Backups" }]}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">Backups</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data ? `${data.total} backup${data.total !== 1 ? "s" : ""} total` : "Loading..."}
            </p>
          </div>

          {/* Batch actions */}
          {selected.size > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">
                {selected.size} selected
              </span>
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setBatchDeleteOpen(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Selected
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelected(new Set())}
              >
                Clear
              </Button>
            </div>
          )}
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative flex-1 min-w-[200px] max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
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
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Project filter */}
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

          {/* Environment filter */}
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

          {/* Clear filters */}
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={clearFilters}
              className="h-9 text-xs text-muted-foreground"
            >
              <X className="h-3 w-3 mr-1" />
              Clear filters
            </Button>
          )}
        </div>

        {/* Content */}
        {loading && !data ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : error && !data ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
            <p className="text-sm text-destructive">{error}</p>
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
          <div className="rounded-lg border border-border bg-background/50 p-12 text-center">
            <Archive className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              {hasFilters ? "No backups match your filters" : "No backups yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
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
            {/* Table header */}
            <div className="flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground border-b border-border">
              <div className="w-5 shrink-0">
                <Checkbox
                  checked={allSelected ? true : someSelected ? "indeterminate" : false}
                  onCheckedChange={(checked) => handleSelectAll(checked === true)}
                />
              </div>
              <div className="w-9 shrink-0" />
              <button
                type="button"
                className="flex items-center gap-1 min-w-0 flex-1 hover:text-foreground transition-colors cursor-pointer"
                onClick={() => handleSort("project_name")}
              >
                Project <SortIcon column="project_name" />
              </button>
              <button
                type="button"
                className="flex items-center gap-1 w-[140px] shrink-0 hover:text-foreground transition-colors cursor-pointer"
                onClick={() => handleSort("created_at")}
              >
                Date <SortIcon column="created_at" />
              </button>
              <button
                type="button"
                className="flex items-center gap-1 w-[80px] shrink-0 hover:text-foreground transition-colors cursor-pointer"
                onClick={() => handleSort("file_size")}
              >
                Size <SortIcon column="file_size" />
              </button>
              <div className="w-[110px] shrink-0" />
            </div>

            {/* Backup rows */}
            <div className="flex flex-col gap-1">
              {data.items.map((backup) => (
                <div
                  key={backup.id}
                  className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors ${
                    selected.has(backup.id)
                      ? "border-primary/40 bg-primary/5"
                      : "border-border bg-background/50"
                  }`}
                >
                  {/* Checkbox */}
                  <div className="w-5 shrink-0">
                    <Checkbox
                      checked={selected.has(backup.id)}
                      onCheckedChange={(checked) =>
                        handleSelectOne(backup.id, checked === true)
                      }
                    />
                  </div>

                  {/* Icon */}
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Archive className="h-4 w-4" />
                  </div>

                  {/* Info */}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Link
                        href={`/projects/${backup.project_id}`}
                        className="text-sm font-medium text-foreground hover:underline"
                      >
                        {backup.project_name}
                      </Link>
                      {backup.environment && (
                        <Badge variant="secondary">{backup.environment}</Badge>
                      )}
                      {backup.tag && (
                        <Badge variant="outline">{backup.tag}</Badge>
                      )}
                      {backup.is_single_json === 1 && (
                        <Badge variant="secondary">JSON</Badge>
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground/60 font-mono">
                      {backup.id.slice(0, 8)}
                    </span>
                  </div>

                  {/* Date */}
                  <div className="w-[140px] shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatDate(backup.created_at)}
                    </span>
                  </div>

                  {/* Size */}
                  <div className="w-[80px] shrink-0">
                    <span className="text-xs text-muted-foreground">
                      {formatBytes(backup.file_size)}
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 w-[110px] shrink-0 justify-end">
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/backups/${backup.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
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
                      onClick={() => setDeleteTarget(backup)}
                    >
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
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
                  {/* Page numbers */}
                  {generatePageNumbers(data.page, data.totalPages).map((p, i) =>
                    p === "..." ? (
                      <span
                        key={`ellipsis-${i}`}
                        className="px-2 text-xs text-muted-foreground"
                      >
                        ...
                      </span>
                    ) : (
                      <Button
                        key={p}
                        variant={p === page ? "default" : "outline"}
                        size="sm"
                        onClick={() => setPage(p as number)}
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

        {/* Loading overlay for subsequent fetches */}
        {loading && data && (
          <div className="absolute inset-0 flex items-center justify-center bg-background/50 rounded-lg">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        )}
      </div>

      {/* Single delete confirmation dialog */}
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

      {/* Batch delete confirmation dialog */}
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
    </AppShell>
  );
}

/**
 * Generate page numbers with ellipsis for pagination display.
 * e.g., [1, 2, 3, "...", 10] or [1, "...", 4, 5, 6, "...", 10]
 */
function generatePageNumbers(
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
