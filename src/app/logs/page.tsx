"use client";

import { useEffect, useState, useCallback } from "react";
import {
  ScrollText,
  Loader2,
  ChevronLeft,
  ChevronRight,
  X,
  CheckCircle2,
  XCircle,
  AlertTriangle,
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

interface WebhookLogEntry {
  id: string;
  project_id: string | null;
  project_name: string | null;
  method: string;
  path: string;
  status_code: number;
  client_ip: string | null;
  user_agent: string | null;
  error_code: string | null;
  error_message: string | null;
  duration_ms: number | null;
  metadata: string | null;
  created_at: string;
}

interface PaginatedLogs {
  items: WebhookLogEntry[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
}

const PAGE_SIZE = 50;

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/** Human-readable error code labels. */
const errorCodeLabels: Record<string, string> = {
  auth_missing: "Auth Missing",
  auth_invalid: "Auth Invalid",
  ip_blocked: "IP Blocked",
  file_missing: "File Missing",
  file_empty: "File Empty",
  file_too_large: "File Too Large",
  file_type_invalid: "Invalid Type",
  env_invalid: "Invalid Env",
  upload_failed: "Upload Failed",
  db_failed: "DB Failed",
  internal_error: "Internal Error",
};

function StatusIcon({ code }: { code: number }) {
  if (code < 300) return <CheckCircle2 className="h-4 w-4 text-emerald-500" />;
  if (code < 400) return <AlertTriangle className="h-4 w-4 text-yellow-500" />;
  return <XCircle className="h-4 w-4 text-destructive" />;
}

function StatusBadge({ code }: { code: number }) {
  if (code < 300) return <Badge variant="secondary" className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">{code}</Badge>;
  if (code < 400) return <Badge variant="secondary" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">{code}</Badge>;
  return <Badge variant="destructive">{code}</Badge>;
}

function MethodBadge({ method }: { method: string }) {
  const colors: Record<string, string> = {
    GET: "bg-blue-500/10 text-blue-600 border-blue-500/20",
    POST: "bg-green-500/10 text-green-600 border-green-500/20",
    HEAD: "bg-purple-500/10 text-purple-600 border-purple-500/20",
  };
  return (
    <Badge variant="secondary" className={colors[method] ?? ""}>
      {method}
    </Badge>
  );
}

export default function LogsPage() {
  // Data
  const [data, setData] = useState<PaginatedLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");

  // Pagination
  const [page, setPage] = useState(1);

  // Expanded row
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Fetch logs
  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      params.set("page", String(page));
      params.set("pageSize", String(PAGE_SIZE));
      if (methodFilter !== "all") params.set("method", methodFilter);
      if (successFilter === "success") params.set("success", "true");
      else if (successFilter === "failure") params.set("success", "false");

      const res = await fetch(`/api/logs?${params.toString()}`);
      if (!res.ok) throw new Error("Failed to fetch logs");
      const result: PaginatedLogs = await res.json();
      setData(result);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [page, methodFilter, successFilter]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  function handleFilterChange(type: "method" | "success", value: string) {
    if (type === "method") setMethodFilter(value);
    else setSuccessFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setMethodFilter("all");
    setSuccessFilter("all");
    setPage(1);
  }

  const hasFilters = methodFilter !== "all" || successFilter !== "all";

  return (
    <AppShell breadcrumbs={[{ label: "Logs" }]}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-foreground">Webhook Logs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data ? `${data.total} log${data.total !== 1 ? "s" : ""} total` : "Loading..."}
          </p>
        </div>

        {/* Filters bar */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Method filter */}
          <Select
            value={methodFilter}
            onValueChange={(v) => handleFilterChange("method", v)}
          >
            <SelectTrigger className="w-[130px] h-9 text-sm">
              <SelectValue placeholder="All Methods" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Methods</SelectItem>
              <SelectItem value="HEAD">HEAD</SelectItem>
              <SelectItem value="GET">GET</SelectItem>
              <SelectItem value="POST">POST</SelectItem>
            </SelectContent>
          </Select>

          {/* Success filter */}
          <Select
            value={successFilter}
            onValueChange={(v) => handleFilterChange("success", v)}
          >
            <SelectTrigger className="w-[140px] h-9 text-sm">
              <SelectValue placeholder="All Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="success">Success</SelectItem>
              <SelectItem value="failure">Failure</SelectItem>
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
            <ScrollText className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              {hasFilters ? "No logs match your filters" : "No webhook logs yet"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {hasFilters
                ? "Try adjusting your filters."
                : "Logs will appear when webhook requests are received."}
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
              <div className="w-5 shrink-0" />
              <div className="w-[60px] shrink-0">Status</div>
              <div className="w-[60px] shrink-0">Method</div>
              <div className="min-w-0 flex-1">Project / Path</div>
              <div className="w-[120px] shrink-0">IP</div>
              <div className="w-[60px] shrink-0 text-right">Time</div>
              <div className="w-[150px] shrink-0">Date</div>
            </div>

            {/* Log rows */}
            <div className="flex flex-col gap-1">
              {data.items.map((log) => (
                <div key={log.id}>
                  {/* Main row */}
                  <button
                    type="button"
                    className={`flex items-center gap-3 rounded-lg border px-4 py-3 transition-colors w-full text-left cursor-pointer ${
                      expandedId === log.id
                        ? "border-primary/40 bg-primary/5"
                        : log.status_code >= 400
                          ? "border-destructive/20 bg-destructive/5 hover:bg-destructive/10"
                          : "border-border bg-background/50 hover:bg-muted/50"
                    }`}
                    onClick={() =>
                      setExpandedId(expandedId === log.id ? null : log.id)
                    }
                  >
                    {/* Status icon */}
                    <div className="w-5 shrink-0 flex items-center justify-center">
                      <StatusIcon code={log.status_code} />
                    </div>

                    {/* Status code */}
                    <div className="w-[60px] shrink-0">
                      <StatusBadge code={log.status_code} />
                    </div>

                    {/* Method */}
                    <div className="w-[60px] shrink-0">
                      <MethodBadge method={log.method} />
                    </div>

                    {/* Project / Path */}
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-foreground truncate">
                        {log.project_name ?? "Unknown"}
                      </div>
                      {log.error_code && (
                        <span className="text-xs text-destructive">
                          {errorCodeLabels[log.error_code] ?? log.error_code}
                        </span>
                      )}
                    </div>

                    {/* IP */}
                    <div className="w-[120px] shrink-0">
                      <span className="text-xs text-muted-foreground font-mono truncate block">
                        {log.client_ip ?? "—"}
                      </span>
                    </div>

                    {/* Duration */}
                    <div className="w-[60px] shrink-0 text-right">
                      <span className="text-xs text-muted-foreground">
                        {log.duration_ms !== null ? `${log.duration_ms}ms` : "—"}
                      </span>
                    </div>

                    {/* Date */}
                    <div className="w-[150px] shrink-0">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expandedId === log.id && (
                    <div className="mx-4 mb-1 rounded-b-lg border border-t-0 border-border bg-muted/30 px-4 py-3 text-sm">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <span className="text-xs text-muted-foreground block mb-0.5">User Agent</span>
                          <span className="text-xs font-mono text-foreground break-all">
                            {log.user_agent ?? "—"}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs text-muted-foreground block mb-0.5">Path</span>
                          <span className="text-xs font-mono text-foreground">
                            {log.path}
                          </span>
                        </div>
                        {log.error_message && (
                          <div className="md:col-span-2">
                            <span className="text-xs text-muted-foreground block mb-0.5">Error</span>
                            <span className="text-xs text-destructive">
                              {log.error_message}
                            </span>
                          </div>
                        )}
                        {log.metadata && (
                          <div className="md:col-span-2">
                            <span className="text-xs text-muted-foreground block mb-0.5">Metadata</span>
                            <pre className="text-xs font-mono text-foreground bg-background/50 rounded p-2 overflow-x-auto">
                              {JSON.stringify(JSON.parse(log.metadata), null, 2)}
                            </pre>
                          </div>
                        )}
                        <div>
                          <span className="text-xs text-muted-foreground block mb-0.5">Log ID</span>
                          <span className="text-xs font-mono text-foreground/60">
                            {log.id}
                          </span>
                        </div>
                        {log.project_id && (
                          <div>
                            <span className="text-xs text-muted-foreground block mb-0.5">Project ID</span>
                            <span className="text-xs font-mono text-foreground/60">
                              {log.project_id}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Pagination */}
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
