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
import { apiFetch, ApiError } from "@/lib/api";
import { generatePageNumbers, formatLogDate } from "@/lib/pagination";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
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

function errorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const body = err.body as { error?: string } | null;
    return body?.error ?? `${fallback} (HTTP ${err.status})`;
  }
  if (err instanceof Error) return err.message;
  return fallback;
}

function StatusIcon({ status }: { status: CronLogEntry["status"] }) {
  switch (status) {
    case "success":
      return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
    case "triggered":
      return <Clock className="h-4 w-4 text-sky-500" />;
    case "skipped":
      return <SkipForward className="h-4 w-4 text-amber-500" />;
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
          className="border-emerald-500/20 bg-emerald-500/10 text-emerald-600"
        >
          Success
        </Badge>
      );
    case "triggered":
      return (
        <Badge
          variant="secondary"
          className="border-sky-500/20 bg-sky-500/10 text-sky-600"
        >
          Triggered
        </Badge>
      );
    case "skipped":
      return (
        <Badge
          variant="secondary"
          className="border-amber-500/20 bg-amber-500/10 text-amber-600"
        >
          Skipped
        </Badge>
      );
    case "failed":
      return <Badge variant="destructive">Failed</Badge>;
  }
}

function CronLogDetail({ log }: { log: CronLogEntry }) {
  return (
    <div className="mx-4 mb-1 rounded-b-lg border border-t-0 border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {log.response_code !== null && (
          <div>
            <span className="mb-0.5 block text-xs text-muted-foreground">
              Response Code
            </span>
            <span className="font-mono text-xs text-foreground">
              {log.response_code}
            </span>
          </div>
        )}

        {log.duration_ms !== null && (
          <div>
            <span className="mb-0.5 block text-xs text-muted-foreground">
              Duration
            </span>
            <span className="font-mono text-xs text-foreground">
              {log.duration_ms}ms
            </span>
          </div>
        )}

        {log.error && (
          <div className="md:col-span-2">
            <span className="mb-0.5 block text-xs text-muted-foreground">
              Error
            </span>
            <span className="break-all text-xs text-destructive">
              {log.error}
            </span>
          </div>
        )}

        <div>
          <span className="mb-0.5 block text-xs text-muted-foreground">
            Log ID
          </span>
          <span className="font-mono text-xs text-foreground/60">
            {log.id}
          </span>
        </div>

        <div>
          <span className="mb-0.5 block text-xs text-muted-foreground">
            Project ID
          </span>
          <span className="font-mono text-xs text-foreground/60">
            {log.project_id}
          </span>
        </div>
      </div>
    </div>
  );
}

export function CronLogsPage() {
  const [data, setData] = useState<PaginatedCronLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const [page, setPage] = useState(1);

  const [expandedId, setExpandedId] = useState<string | null>(null);

  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function loadProjects() {
      try {
        const res = await apiFetch("/api/projects");
        const list = (await res.json()) as ProjectInfo[];
        setProjects(list);
      } catch {
        // Non-critical
      }
    }
    void loadProjects();
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (statusFilter !== "all") params.set("status", statusFilter);
      if (projectFilter !== "all") params.set("projectId", projectFilter);

      const res = await apiFetch(`/api/logs/cron?${params.toString()}`);
      const result = (await res.json()) as PaginatedCronLogs;
      setData(result);
    } catch (err) {
      const msg = errorMessage(err, "Failed to fetch cron logs");
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

      await apiFetch(`/api/logs/cron?${params.toString()}`, {
        method: "DELETE",
      });
      toast.success("Cron logs cleared");
      setPage(1);
      await fetchLogs();
    } catch (err) {
      toast.error(errorMessage(err, "Failed to delete cron logs"));
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div className="relative flex flex-col gap-4 md:gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-foreground">Cron Logs</h1>
          <p className="mt-1 text-sm text-muted-foreground">
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
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-3.5 w-3.5" />
            )}
            Clear
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Select
          value={projectFilter}
          onValueChange={(v) => handleFilterChange("project", v)}
        >
          <SelectTrigger className="h-9 w-[160px] text-sm">
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

        <Select
          value={statusFilter}
          onValueChange={(v) => handleFilterChange("status", v)}
        >
          <SelectTrigger className="h-9 w-[140px] text-sm">
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
            <X className="mr-1 h-3 w-3" />
            Clear filters
          </Button>
        )}
      </div>

      {loading && !data ? (
        <CronLogsListSkeleton />
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
          <Timer className="mx-auto mb-3 h-10 w-10 text-muted-foreground/40" />
          <p className="text-sm font-medium text-foreground">
            {hasFilters
              ? "No cron logs match your filters"
              : "No cron logs yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
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
          <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-xs text-muted-foreground md:flex">
            <div className="w-5 shrink-0" />
            <div className="w-[90px] shrink-0">Status</div>
            <div className="min-w-0 flex-1">Project</div>
            <div className="w-[80px] shrink-0 text-right">Response</div>
            <div className="w-[70px] shrink-0 text-right">Duration</div>
            <div className="w-[130px] shrink-0">Date</div>
          </div>

          <div className="flex flex-col gap-1">
            {data.items.map((log) => (
              <div key={log.id}>
                <button
                  type="button"
                  className={`flex w-full cursor-pointer flex-col gap-3 rounded-lg border px-4 py-3 text-left transition-colors md:flex-row md:items-center ${
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
                  <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
                    <div className="flex w-5 shrink-0 items-center justify-center pt-0.5 md:pt-0">
                      <StatusIcon status={log.status} />
                    </div>

                    <div className="hidden w-[90px] shrink-0 md:block">
                      <StatusBadge status={log.status} />
                    </div>

                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-sm font-medium text-foreground">
                          {log.project_name ?? "Unknown"}
                        </div>
                        <div className="md:hidden">
                          <StatusBadge status={log.status} />
                        </div>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground md:hidden">
                        <span className="font-mono">
                          {log.response_code ?? "—"}
                        </span>
                        <span>
                          {log.duration_ms !== null
                            ? `${log.duration_ms}ms`
                            : "—"}
                        </span>
                        <span>{formatLogDate(log.triggered_at)}</span>
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

                  <div className="hidden w-[80px] shrink-0 text-right md:block">
                    <span className="font-mono text-xs text-muted-foreground">
                      {log.response_code ?? "—"}
                    </span>
                  </div>

                  <div className="hidden w-[70px] shrink-0 text-right md:block">
                    <span className="text-xs text-muted-foreground">
                      {log.duration_ms !== null
                        ? `${log.duration_ms}ms`
                        : "—"}
                    </span>
                  </div>

                  <div className="hidden w-[130px] shrink-0 md:block">
                    <span className="whitespace-nowrap text-xs text-muted-foreground">
                      {formatLogDate(log.triggered_at)}
                    </span>
                  </div>
                </button>

                {expandedId === log.id && <CronLogDetail log={log} />}
              </div>
            ))}
          </div>

          {data.totalPages > 1 && (
            <div className="flex items-center justify-between pt-2">
              <span className="text-xs text-muted-foreground">
                Page {data.page} of {data.totalPages}
                {" · "}
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
        <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-background/50">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}

function CronLogsListSkeleton() {
  return (
    <>
      <div className="hidden items-center gap-3 border-b border-border px-4 py-2 md:flex">
        <Skeleton className="h-4 w-5" />
        <Skeleton className="h-4 w-[90px]" />
        <Skeleton className="h-4 max-w-[120px] flex-1" />
        <Skeleton className="h-4 w-[80px]" />
        <Skeleton className="h-4 w-[70px]" />
        <Skeleton className="h-4 w-[130px]" />
      </div>

      <div className="flex flex-col gap-1">
        {Array.from({ length: 10 }).map((_, i) => (
          <div
            key={i}
            className="flex flex-col gap-3 rounded-lg border border-border bg-background/50 px-4 py-3 md:flex-row md:items-center"
          >
            <div className="flex min-w-0 flex-1 items-start gap-3 md:items-center">
              <Skeleton className="h-4 w-5 shrink-0" />
              <Skeleton className="hidden h-5 w-[90px] shrink-0 rounded-full md:block" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-5 w-16 rounded-full md:hidden" />
                </div>
                <div className="mt-1 flex items-center gap-3 md:hidden">
                  <Skeleton className="h-3 w-12" />
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="h-3 w-24" />
                </div>
              </div>
            </div>
            <div className="hidden items-center gap-3 md:flex">
              <Skeleton className="h-3 w-[80px]" />
              <Skeleton className="h-3 w-[70px]" />
              <Skeleton className="h-3 w-[130px]" />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
