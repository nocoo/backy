"use client";

import { useEffect, useState, useCallback } from "react";
import {
  Timer,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
  Clock,
  SkipForward,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface CronLogEntry {
  id: string;
  project_id: string;
  project_name: string | null;
  status: "triggered" | "skipped" | "success" | "failed";
  response_code: number | null;
  error: string | null;
  duration_ms: number | null;
  triggered_at: string;
}

interface PaginatedCronLogs {
  items: CronLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

interface ProjectInfo {
  id: string;
  name: string;
}

const PAGE_SIZE = 50;

/** Compact single-line date: "Feb 24, 14:03:21" */
function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  const month = d.toLocaleString("en-US", { month: "short" });
  const day = d.getDate();
  const h = String(d.getHours()).padStart(2, "0");
  const m = String(d.getMinutes()).padStart(2, "0");
  const s = String(d.getSeconds()).padStart(2, "0");
  return `${month} ${day}, ${h}:${m}:${s}`;
}

function StatusIcon({ status }: { status: CronLogEntry["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-success" />;
    case "triggered":
      return <Clock className="h-4 w-4 text-info" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-warning" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />;
  }
}

function StatusBadge({ status }: { status: CronLogEntry["status"] }) {
  switch (status) {
    case "success":
      return (
        <Badge
          variant="secondary"
          className="border-success/20 bg-success/10 text-success"
        >
          Success
        </Badge>
      );
    case "triggered":
      return (
        <Badge
          variant="secondary"
          className="border-info/20 bg-info/10 text-info"
        >
          Triggered
        </Badge>
      );
    case "skipped":
      return (
        <Badge
          variant="secondary"
          className="border-warning/20 bg-warning/10 text-warning"
        >
          Skipped
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
  }
}

/** Expanded detail panel for a single cron log entry. */
function CronLogDetail({ log }: { log: CronLogEntry }) {
  return (
    <div className="mx-4 mb-1 rounded-b-lg border border-t-0 border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* Response code */}
        {log.response_code !== null && (
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">
              Response Code
            </span>
            <span className="text-xs font-mono text-foreground">
              {log.response_code}
            </span>
          </div>
        )}

        {/* Duration */}
        {log.duration_ms !== null && (
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">
              Duration
            </span>
            <span className="text-xs font-mono text-foreground">
              {log.duration_ms}ms
            </span>
          </div>
        )}

        {/* Error */}
        {log.error && (
          <div className="md:col-span-2">
            <span className="text-xs text-muted-foreground block mb-0.5">
              Error
            </span>
            <span className="text-xs text-destructive break-all">
              {log.error}
            </span>
          </div>
        )}

        {/* Log ID */}
        <div>
          <span className="text-xs text-muted-foreground block mb-0.5">
            Log ID
          </span>
          <span className="text-xs font-mono text-foreground/60">
            {log.id}
          </span>
        </div>

        {/* Project ID */}
        <div>
          <span className="text-xs text-muted-foreground block mb-0.5">
            Project ID
          </span>
          <span className="text-xs font-mono text-foreground/60">
            {log.project_id}
          </span>
        </div>
      </div>
    </div>
  );
}

export default function CronLogsPage() {
  // Data
  const [data, setData] = useState<PaginatedCronLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Projects list for filter dropdown
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  // Filters
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Deleting state
  const [deleting, setDeleting] = useState(false);

  // Fetch projects list once
  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await fetch("/api/projects");
        if (!res.ok) return;
        const list: ProjectInfo[] = await res.json();
        setProjects(list);
      } catch {
        // Non-critical
      }
    }
    void loadProjects();
  }, []);

  // Fetch cron logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (projectFilter !== "all") params.set("projectId", projectFilter);

      const res = await fetch(`/api/cron/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch cron logs");
      const result: PaginatedCronLogs = await res.json();
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter, projectFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  function handleFilterChange(type: "status" | "project", value: string) {
    if (type === "status") setStatusFilter(value);
    else setProjectFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setStatusFilter("all");
    setProjectFilter("all");
    setPage(1);
  }

  const hasFilters = statusFilter !== "all" || projectFilter !== "all";

  // Delete cron logs matching current filters
  async function handleClearLogs() {
    const filterDesc: string[] = [];
    if (projectFilter !== "all") {
      const proj = projects.find((p) => p.id === projectFilter);
      filterDesc.push(proj?.name ?? projectFilter);
    }
    if (statusFilter !== "all") filterDesc.push(statusFilter);

    const desc =
      filterDesc.length > 0
        ? `${filterDesc.join(", ")} cron logs`
        : "all cron logs";

    if (!confirm(`Delete ${desc}? This action cannot be undone.`)) return;

    try {
      setDeleting(true);
      const params = new URLSearchParams();
      if (projectFilter !== "all") params.set("projectId", projectFilter);
      if (statusFilter !== "all") params.set("status", statusFilter);

      const res = await fetch(`/api/cron/logs?${params.toString()}`, {
        method: "DELETE",
      });

      if (!res.ok) throw new Error("Failed to delete cron logs");
      toast.success("Cron logs cleared");
      setPage(1);
      await fetchLogs();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(msg);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell breadcrumbs={[{ label: "Cron Logs" }]}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Cron Logs
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {data
                ? `${data.total} log${data.total !== 1 ? "s" : ""} total`
                : "Loading..."}
            </p>
          </div>
          {data && data.total > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleClearLogs()}
              disabled={deleting || loading}
              className="text-destructive hover:text-destructive"
            >
              {deleting ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
              )}
              Clear
            </Button>
          )}
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Project filter */}
          <Select
            value={projectFilter}
            onValueChange={(v) => handleFilterChange("project", v)}
          >
            <SelectTrigger className="w-[160px] h-9 text-sm">
              <SelectValue placeholder="All Projects" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Status filter */}
          <Select
            value={statusFilter}
            onValueChange={(v) => handleFilterChange("status", v)}
          >
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="triggered">Triggered</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="skipped">Skipped</SelectItem>
              <SelectItem value="failed">Failed</SelectItem>
            </SelectContent>
          </Select>

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
              onClick={() => void fetchLogs()}
            >
              Retry
            </Button>
          </div>
        ) : data && data.items.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/50 p-12 text-center">
            <Timer className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              {hasFilters
                ? "No cron logs match your filters"
                : "No cron logs yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasFilters
                ? "Try adjusting your filters."
                : "Cron logs will appear when auto-backup triggers run."}
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
            <div className="hidden md:flex items-center gap-3 px-4 py-2 text-xs text-muted-foreground border-b border-border">
              <div className="w-5 shrink-0" />
              <div className="w-[90px] shrink-0">Status</div>
              <div className="min-w-0 flex-1">Project</div>
              <div className="w-[80px] shrink-0 text-right">Response</div>
              <div className="w-[70px] shrink-0 text-right">Duration</div>
              <div className="w-[130px] shrink-0">Date</div>
            </div>

            {/* Log rows */}
            <div className="flex flex-col gap-1">
              {data.items.map((log) => (
                <div key={log.id}>
                  {/* Main row */}
                    <button
                      type="button"
                      className={`flex w-full flex-col gap-3 rounded-lg border px-4 py-3 text-left transition-colors cursor-pointer md:flex-row md:items-center ${
                        expandedId === log.id
                          ? "border-primary/40 bg-primary/5"
                          : log.status === "failed"
                          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                          : "border-border bg-background/50 hover:bg-muted/50"
                    }`}
                    onClick={() =>
                      setExpandedId(expandedId === log.id ? null : log.id)
                    }
                  >
                      <div className="flex items-start gap-3 min-w-0 flex-1 md:items-center">
                        {/* Status icon */}
                        <div className="flex w-5 shrink-0 items-center justify-center pt-0.5 md:pt-0">
                          <StatusIcon status={log.status} />
                        </div>

                        {/* Status badge */}
                        <div className="hidden w-[90px] shrink-0 md:block">
                          <StatusBadge status={log.status} />
                        </div>

                        {/* Project name */}
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <div className="text-sm font-medium text-foreground truncate">
                              {log.project_name ?? "Unknown"}
                            </div>
                            <div className="md:hidden">
                              <StatusBadge status={log.status} />
                            </div>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:hidden">
                            <span className="font-mono">{log.response_code ?? "\u2014"}</span>
                            <span>
                              {log.duration_ms !== null
                                ? `${log.duration_ms}ms`
                                : "\u2014"}
                            </span>
                            <span>{formatDate(log.triggered_at)}</span>
                          </div>
                          {log.error && (
                            <span className="mt-1 block truncate text-xs text-destructive">
                              {log.error.length > 60
                                ? `${log.error.slice(0, 60)}...`
                                : log.error}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Response code */}
                      <div className="hidden w-[80px] shrink-0 text-right md:block">
                        <span className="text-xs text-muted-foreground font-mono">
                          {log.response_code ?? "\u2014"}
                        </span>
                      </div>

                      {/* Duration */}
                      <div className="hidden w-[70px] shrink-0 text-right md:block">
                        <span className="text-xs text-muted-foreground">
                          {log.duration_ms !== null
                            ? `${log.duration_ms}ms`
                            : "\u2014"}
                        </span>
                      </div>

                      {/* Date */}
                      <div className="hidden w-[130px] shrink-0 md:block">
                        <span className="text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(log.triggered_at)}
                        </span>
                      </div>
                    </button>

                  {/* Expanded detail */}
                  {expandedId === log.id && <CronLogDetail log={log} />}
                </div>
              ))}
            </div>

            {/* Pagination */}
            {data.totalPages > 1 && (
              <div className="flex items-center justify-between pt-2">
                <span className="text-xs text-muted-foreground">
                  Page {data.page} of {data.totalPages}
                  {" \u00b7 "}
                  {data.total} log{data.total !== 1 ? "s" : ""}
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
                  {generatePageNumbers(data.page, data.totalPages).map(
                    (p, i) =>
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
    </AppShell>
  );
}

/**
 * Generate page numbers with ellipsis for pagination display.
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
