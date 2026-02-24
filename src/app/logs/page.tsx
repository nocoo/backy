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
  Trash2,
  MapPin,
  Wifi,
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

interface ProjectInfo {
  id: string;
  name: string;
}

const PAGE_SIZE = 50;

/** The project name to exclude by default (automated testing). */
const EXCLUDED_PROJECT_NAMES = ["GunTest", "backy-test"];

/** Client IPs to exclude by default (localhost / test traffic). */
const EXCLUDED_CLIENT_IPS = ["::1"];

interface IpInfoLocation {
  country: string;
  province: string;
  city: string;
  isp: string;
}

interface IpInfo {
  ip: string;
  location: IpInfoLocation;
}

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
  if (code < 300)
    return (
      <Badge
        variant="secondary"
        className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      >
        {code}
      </Badge>
    );
  if (code < 400)
    return (
      <Badge
        variant="secondary"
        className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20"
      >
        {code}
      </Badge>
    );
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

/** Expanded detail panel for a single log entry — fetches IP geo info. */
function LogDetail({ log }: { log: WebhookLogEntry }) {
  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [ipLoading, setIpLoading] = useState(false);

  useEffect(() => {
    if (!log.client_ip || ipInfo || ipLoading) return;

    async function fetchIpInfo() {
      try {
        setIpLoading(true);
        const res = await fetch(
          `/api/ip-info?ip=${encodeURIComponent(log.client_ip!)}`,
        );
        if (!res.ok) return;
        const data: IpInfo = await res.json();
        setIpInfo(data);
      } catch {
        // Non-critical
      } finally {
        setIpLoading(false);
      }
    }

    void fetchIpInfo();
  }, [log.client_ip]); // eslint-disable-line react-hooks/exhaustive-deps

  const locationParts = ipInfo?.location
    ? [
        ipInfo.location.city,
        ipInfo.location.province,
        ipInfo.location.country,
      ].filter((s) => s && s !== "0")
    : [];

  const isp =
    ipInfo?.location?.isp && ipInfo.location.isp !== "0"
      ? ipInfo.location.isp
      : null;

  return (
    <div className="mx-4 mb-1 rounded-b-lg border border-t-0 border-border bg-muted/30 px-4 py-3 text-sm">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {/* IP + Geo info */}
        <div>
          <span className="text-xs text-muted-foreground block mb-0.5">
            Client IP
          </span>
          <span className="text-xs font-mono text-foreground">
            {log.client_ip ?? "\u2014"}
          </span>
          {ipLoading && (
            <div className="flex items-center gap-1.5 mt-1 text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />
              <span className="text-xs">Loading IP info...</span>
            </div>
          )}
          {!ipLoading && (locationParts.length > 0 || isp) && (
            <div className="flex flex-col gap-1 mt-1.5 pt-1.5 border-t border-border">
              {locationParts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">
                    {locationParts.join(", ")}
                  </span>
                </div>
              )}
              {isp && (
                <div className="flex items-center gap-1.5">
                  <Wifi className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground">{isp}</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* User Agent */}
        <div>
          <span className="text-xs text-muted-foreground block mb-0.5">
            User Agent
          </span>
          <span className="text-xs font-mono text-foreground break-all">
            {log.user_agent ?? "\u2014"}
          </span>
        </div>

        {/* Path */}
        <div>
          <span className="text-xs text-muted-foreground block mb-0.5">
            Path
          </span>
          <span className="text-xs font-mono text-foreground">{log.path}</span>
        </div>

        {/* Error */}
        {log.error_message && (
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">
              Error
            </span>
            <span className="text-xs text-destructive">
              {log.error_message}
            </span>
          </div>
        )}

        {/* Metadata */}
        {log.metadata && (
          <div className="md:col-span-2">
            <span className="text-xs text-muted-foreground block mb-0.5">
              Metadata
            </span>
            <pre className="text-xs font-mono text-foreground bg-background/50 rounded p-2 overflow-x-auto">
              {JSON.stringify(JSON.parse(log.metadata), null, 2)}
            </pre>
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
        {log.project_id && (
          <div>
            <span className="text-xs text-muted-foreground block mb-0.5">
              Project ID
            </span>
            <span className="text-xs font-mono text-foreground/60">
              {log.project_id}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LogsPage() {
  // Data
  const [data, setData] = useState<PaginatedLogs | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Projects list for filter dropdown
  const [projects, setProjects] = useState<ProjectInfo[]>([]);

  // Filters
  const [methodFilter, setMethodFilter] = useState<string>("all");
  const [successFilter, setSuccessFilter] = useState<string>("all");
  const [projectFilter, setProjectFilter] = useState<string>("default");
  // "default" = exclude GunTest, "all" = show all, "<projectId>" = specific project

  // The GunTest/backy-test project IDs (resolved from projects list)
  const [excludedProjectIds, setExcludedProjectIds] = useState<string[]>([]);

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
        const ids = list
          .filter((p) => EXCLUDED_PROJECT_NAMES.includes(p.name))
          .map((p) => p.id);
        setExcludedProjectIds(ids);
      } catch {
        // Non-critical — filter just won't have project options
      }
    }
    void loadProjects();
  }, []);

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

      if (projectFilter === "default" && excludedProjectIds.length > 0) {
        // Exclude test projects by default
        params.set("excludeProjectIds", excludedProjectIds.join(","));
      } else if (projectFilter === "default") {
        // Projects not yet loaded but still apply IP filter below
      } else if (
        projectFilter !== "all"
      ) {
        // Specific project selected
        params.set("projectId", projectFilter);
      }

      // Always exclude localhost IPs in default mode
      if (projectFilter === "default") {
        params.set("excludeClientIps", EXCLUDED_CLIENT_IPS.join(","));
      }

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
  }, [page, methodFilter, successFilter, projectFilter, excludedProjectIds]);

  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  function handleFilterChange(
    type: "method" | "success" | "project",
    value: string,
  ) {
    if (type === "method") setMethodFilter(value);
    else if (type === "success") setSuccessFilter(value);
    else setProjectFilter(value);
    setPage(1);
  }

  function clearFilters() {
    setMethodFilter("all");
    setSuccessFilter("all");
    setProjectFilter("default");
    setPage(1);
  }

  const hasFilters =
    methodFilter !== "all" ||
    successFilter !== "all" ||
    projectFilter !== "default";

  // Clear (delete) logs matching current filters
  async function handleClearLogs() {
    const filterDesc: string[] = [];
    if (projectFilter !== "all" && projectFilter !== "default") {
      const proj = projects.find((p) => p.id === projectFilter);
      filterDesc.push(proj?.name ?? projectFilter);
    } else if (projectFilter === "default" && excludedProjectIds.length > 0) {
      // "default" shows everything except GunTest — clearing "default" is ambiguous.
      // We'll clear all logs (user can filter first if they want specific).
    }
    if (methodFilter !== "all") filterDesc.push(methodFilter);
    if (successFilter === "success") filterDesc.push("successful");
    else if (successFilter === "failure") filterDesc.push("failed");

    const desc =
      filterDesc.length > 0
        ? `${filterDesc.join(", ")} logs`
        : "all visible logs";

    if (!confirm(`Delete ${desc}? This action cannot be undone.`)) return;

    try {
      setDeleting(true);
      const body: Record<string, unknown> = {};
      if (
        projectFilter !== "all" &&
        projectFilter !== "default"
      ) {
        body.projectId = projectFilter;
      }
      if (methodFilter !== "all") body.method = methodFilter;
      if (successFilter === "success") body.success = true;
      else if (successFilter === "failure") body.success = false;

      const res = await fetch("/api/logs", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      if (!res.ok) throw new Error("Failed to delete logs");
      toast.success("Logs cleared");
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
    <AppShell breadcrumbs={[{ label: "Logs" }]}>
      <div className="flex flex-col gap-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Webhook Logs
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
              <SelectItem value="default">Exclude Test Traffic</SelectItem>
              <SelectItem value="all">All Projects</SelectItem>
              {projects.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

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
              {hasFilters
                ? "No logs match your filters"
                : "No webhook logs yet"}
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
              <div className="w-[60px] shrink-0 text-right">Duration</div>
              <div className="w-[130px] shrink-0">Date</div>
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
                        {log.client_ip ?? "\u2014"}
                      </span>
                    </div>

                    {/* Duration */}
                    <div className="w-[60px] shrink-0 text-right">
                      <span className="text-xs text-muted-foreground">
                        {log.duration_ms !== null
                          ? `${log.duration_ms}ms`
                          : "\u2014"}
                      </span>
                    </div>

                    {/* Date (compact single-line) */}
                    <div className="w-[130px] shrink-0">
                      <span className="text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                  </button>

                  {/* Expanded detail */}
                  {expandedId === log.id && <LogDetail log={log} />}
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
