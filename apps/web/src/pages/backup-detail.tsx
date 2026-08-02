import { useEffect, useState, useCallback } from "react";
import { useParams, useNavigate } from "react-router";
import {
  ArrowLeft,
  Download,
  Trash2,
  Loader2,
  FileJson,
  FileArchive,
  Unplug,
  Clock,
  HardDrive,
  Globe,
  Tag,
  FolderOpen,
  Link2,
  Copy,
  Check,
  MapPin,
  Wifi,
} from "lucide-react";
import { toast } from "sonner";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { JsonTreeViewer } from "@/components/json-tree-viewer";

interface BackupDetail {
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

interface IpInfoLocation {
  country: string;
  province: string;
  city: string;
  isp: string;
  iso2: string;
}

interface IpInfo {
  ip: string;
  version: number;
  location: IpInfoLocation;
  latencyMs: number;
  source: string;
  attribution: string;
}

const FILE_TYPE_LABELS: Record<string, string> = {
  json: "JSON",
  zip: "ZIP",
  gz: "GZ",
  tgz: "TGZ",
  unknown: "File",
};

const EXTRACT_LABELS: Record<string, string> = {
  zip: "Extract JSON from ZIP",
  gz: "Extract JSON from GZ",
  tgz: "Extract JSON from TGZ",
};

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
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

export function BackupDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id ?? "";
  const navigate = useNavigate();

  const [backup, setBackup] = useState<BackupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [previewData, setPreviewData] = useState<unknown>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const [extracting, setExtracting] = useState(false);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [restoreCommand, setRestoreCommand] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const [ipInfo, setIpInfo] = useState<IpInfo | null>(null);
  const [ipInfoLoading, setIpInfoLoading] = useState(false);

  const fetchBackup = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await apiFetch(`/api/backups/${id}`);
      const data = (await res.json()) as BackupDetail;
      setBackup(data);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) {
        setError("Backup not found");
      } else {
        setError(errorMessage(err, "Failed to fetch backup"));
      }
    } finally {
      setLoading(false);
    }
  }, [id]);

  const loadPreview = useCallback(async () => {
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      const res = await apiFetch(`/api/backups/${id}/preview`);
      const data = (await res.json()) as { content: unknown };
      setPreviewData(data.content);
    } catch (err) {
      setPreviewError(errorMessage(err, "Failed to load preview"));
    } finally {
      setPreviewLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchBackup();
  }, [fetchBackup]);

  useEffect(() => {
    if (!backup || previewData || previewLoading) return;
    if (backup.json_key) {
      void loadPreview();
    }
  }, [backup, previewData, previewLoading, loadPreview]);

  useEffect(() => {
    if (!backup || ipInfo || ipInfoLoading) return;
    if (backup.sender_ip === "unknown") return;

    const senderIp = backup.sender_ip;
    async function fetchIpInfo() {
      try {
        setIpInfoLoading(true);
        const res = await apiFetch(
          `/api/ip-info?ip=${encodeURIComponent(senderIp)}`,
        );
        const data = (await res.json()) as IpInfo;
        setIpInfo(data);
      } catch {
        // Non-critical — IP info is supplementary
      } finally {
        setIpInfoLoading(false);
      }
    }

    void fetchIpInfo();
  }, [backup, ipInfo, ipInfoLoading]);

  async function handleExtract() {
    try {
      setExtracting(true);
      setPreviewError(null);
      await apiFetch(`/api/backups/${id}/extract`, { method: "POST" });
      await fetchBackup();
      await loadPreview();
    } catch (err) {
      setPreviewError(errorMessage(err, "Extraction failed"));
    } finally {
      setExtracting(false);
    }
  }

  async function handleDownload() {
    try {
      const res = await apiFetch(`/api/backups/${id}/download`);
      const data = (await res.json()) as { url: string };
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error(errorMessage(err, "Download failed"));
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      await apiFetch(`/api/backups/${id}`, { method: "DELETE" });
      navigate("/backups");
    } catch (err) {
      toast.error(errorMessage(err, "Delete failed"));
      setDeleting(false);
    }
  }

  async function handleGenerateRestoreUrl() {
    if (!backup) return;
    try {
      setRestoreLoading(true);
      const res = await apiFetch(`/api/backups/${backup.id}/restore-command`);
      const data = (await res.json()) as { command: string };
      setRestoreCommand(data.command);
    } catch (err) {
      toast.error(errorMessage(err, "Failed to generate restore command"));
    } finally {
      setRestoreLoading(false);
    }
  }

  async function handleCopyRestoreUrl() {
    if (!restoreCommand) return;
    await navigator.clipboard.writeText(restoreCommand);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (loading) {
    return <BackupDetailSkeleton />;
  }

  if (error && !backup) {
    return (
      <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
        <p className="text-sm text-destructive">{error}</p>
        <Button
          variant="outline"
          size="sm"
          className="mt-3"
          onClick={() => navigate("/backups")}
        >
          Back to Backups
        </Button>
      </div>
    );
  }

  if (!backup) return null;

  const fileType = backup.file_type || "unknown";
  const isJson = fileType === "json";
  const isExtractableType =
    fileType === "zip" || fileType === "gz" || fileType === "tgz";
  const isUnknown = !isJson && !isExtractableType;
  const hasPreview = !!backup.json_key;
  const canExtract = isExtractableType && !hasPreview;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate("/backups")}
          >
            <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
            Back
          </Button>
          <div className="flex items-center gap-2">
            {isJson ? (
              <FileJson className="h-5 w-5 text-primary" />
            ) : (
              <FileArchive className="h-5 w-5 text-muted-foreground" />
            )}
            <h1 className="text-lg font-semibold text-foreground">
              {backup.tag || "Untitled Backup"}
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleDownload()}
          >
            <Download className="h-3.5 w-3.5 mr-1.5" />
            Download
          </Button>
          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete this backup?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. The backup file will be
                  permanently deleted from storage.
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteOpen(false)}
                  disabled={deleting}
                >
                  Cancel
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => void handleDelete()}
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
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                JSON Preview
              </h2>
              {canExtract && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void handleExtract()}
                  disabled={extracting}
                >
                  {extracting ? (
                    <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <FileJson className="h-3.5 w-3.5 mr-1.5" />
                  )}
                  {EXTRACT_LABELS[fileType] ?? "Extract JSON"}
                </Button>
              )}
            </div>

            {previewLoading ? (
              <div className="flex items-center justify-center py-8 rounded-lg border bg-secondary">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                <span className="ml-2 text-sm text-muted-foreground">
                  Loading preview...
                </span>
              </div>
            ) : previewError !== null ? (
              <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                <p className="text-sm text-destructive">{previewError}</p>
              </div>
            ) : previewData ? (
              <JsonTreeViewer data={previewData} />
            ) : canExtract && !extracting ? (
              <div className="rounded-lg border bg-secondary p-6 text-center">
                <FileArchive className="h-8 w-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  This is a {FILE_TYPE_LABELS[fileType] ?? "archive"} file.
                  Click &ldquo;{EXTRACT_LABELS[fileType] ?? "Extract JSON"}
                  &rdquo; to preview the JSON content.
                </p>
              </div>
            ) : isUnknown && !hasPreview ? (
              <div className="rounded-lg border bg-secondary p-6 text-center">
                <HardDrive className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Preview is not available for this file format.
                </p>
              </div>
            ) : !hasPreview ? (
              <div className="rounded-lg border bg-secondary p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  No JSON preview available for this backup.
                </p>
              </div>
            ) : null}
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-semibold text-foreground">
                Restore URL
              </h2>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleGenerateRestoreUrl()}
                disabled={restoreLoading}
              >
                {restoreLoading ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <Link2 className="h-3.5 w-3.5 mr-1.5" />
                )}
                {restoreCommand ? "Regenerate" : "Generate Command"}
              </Button>
            </div>

            {restoreCommand ? (
              <div className="rounded-[var(--radius-widget)] bg-secondary p-4 flex flex-col gap-3">
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground break-all whitespace-pre-wrap">
                    {restoreCommand}
                  </code>
                  <Button
                    variant="outline"
                    size="sm"
                    aria-label="Copy restore command"
                    onClick={() => void handleCopyRestoreUrl()}
                    className="shrink-0"
                  >
                    {copied ? (
                      <Check className="h-3.5 w-3.5" />
                    ) : (
                      <Copy className="h-3.5 w-3.5" />
                    )}
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>
                    This command uses the project&apos;s webhook token via the
                    Authorization header. The presigned download link returned
                    expires after <strong>15 minutes</strong>.
                  </p>
                </div>
              </div>
            ) : (
              <div className="rounded-lg border bg-secondary p-6 text-center">
                <Link2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">
                  Generate a restore URL for your AI agent to download this
                  backup.
                </p>
              </div>
            )}
          </section>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <h2 className="text-base font-semibold text-foreground">Details</h2>
          <MetadataItem
            icon={<FolderOpen className="h-4 w-4" />}
            label="Project"
            value={backup.project_name}
            href={`/projects/${backup.project_id}`}
          />
          <MetadataItem
            icon={<HardDrive className="h-4 w-4" />}
            label="Size"
            value={formatBytes(backup.file_size)}
          />
          <MetadataItem
            icon={<Clock className="h-4 w-4" />}
            label="Created"
            value={formatDate(backup.created_at)}
          />

          <div className="rounded-[var(--radius-widget)] bg-secondary p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <Globe className="h-4 w-4" />
              <span className="text-xs">Sender</span>
            </div>
            <div className="text-sm font-medium text-foreground font-mono">
              {backup.sender_ip}
            </div>
            {ipInfoLoading ? (
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <Loader2 className="h-3 w-3 animate-spin" />
                <span className="text-xs">Loading IP info...</span>
              </div>
            ) : ipInfo?.location ? (
              <div className="flex flex-col gap-1.5 pt-1 border-t border-border">
                {(ipInfo.location.city ||
                  ipInfo.location.province ||
                  ipInfo.location.country) && (
                  <div className="flex items-center gap-1.5">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {[
                        ipInfo.location.city,
                        ipInfo.location.province,
                        ipInfo.location.country,
                      ]
                        .filter((s) => s && s !== "0")
                        .join(", ")}
                    </span>
                  </div>
                )}
                {ipInfo.location.isp && ipInfo.location.isp !== "0" && (
                  <div className="flex items-center gap-1.5">
                    <Wifi className="h-3 w-3 text-muted-foreground shrink-0" />
                    <span className="text-xs text-muted-foreground">
                      {ipInfo.location.isp}
                    </span>
                  </div>
                )}
              </div>
            ) : null}
          </div>
          {backup.environment && (
            <MetadataItem
              icon={<Unplug className="h-4 w-4" />}
              label="Environment"
              value={
                <Badge variant="secondary" className="text-xs">
                  {backup.environment}
                </Badge>
              }
            />
          )}
          {backup.tag && (
            <MetadataItem
              icon={<Tag className="h-4 w-4" />}
              label="Tag"
              value={backup.tag}
            />
          )}

          <div className="rounded-[var(--radius-widget)] bg-secondary p-3 flex flex-col gap-2">
            <div className="flex items-center gap-1.5 text-muted-foreground">
              <span className="text-xs">File Info</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs">Type:</span>
              <Badge
                variant={isJson ? "default" : "secondary"}
                className="text-xs"
              >
                {FILE_TYPE_LABELS[fileType] ?? fileType.toUpperCase()}
              </Badge>
            </div>
            <div className="text-xs">
              <span className="text-muted-foreground">Key:</span>
              <code className="ml-1 font-mono text-muted-foreground break-all">
                {backup.file_key}
              </code>
            </div>
            {backup.json_key && (
              <div className="text-xs">
                <span className="text-muted-foreground">Preview:</span>
                <code className="ml-1 font-mono text-muted-foreground break-all">
                  {backup.json_key}
                </code>
                {backup.json_extracted ? (
                  <Badge variant="secondary" className="text-xs ml-1">
                    extracted
                  </Badge>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>

      <section className="text-xs text-muted-foreground/60 flex items-center gap-4">
        <span className="font-mono">{backup.id}</span>
        <span>Updated {formatDate(backup.updated_at)}</span>
      </section>
    </div>
  );
}

function MetadataItem({
  icon,
  label,
  value,
  href,
}: {
  icon: React.ReactNode;
  label: string;
  value: React.ReactNode;
  href?: string | undefined;
}) {
  const content = (
    <div className="rounded-[var(--radius-widget)] bg-secondary p-3 flex flex-col gap-1">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
      </div>
      <div className="text-sm font-medium text-foreground truncate">
        {value}
      </div>
    </div>
  );

  if (href) {
    return (
      <a
        href={href}
        className="hover:ring-1 hover:ring-primary/30 rounded-lg transition-shadow"
      >
        {content}
      </a>
    );
  }

  return content;
}

function BackupDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-start justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-8 w-20 rounded-md" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-5" />
            <Skeleton className="h-6 w-40" />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28 rounded-md" />
          <Skeleton className="h-8 w-20 rounded-md" />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-8 flex flex-col gap-6">
          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-28" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
            <div className="rounded-lg border bg-secondary p-6">
              <Skeleton className="h-48 w-full rounded-md" />
            </div>
          </section>

          <section className="flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-8 w-40 rounded-md" />
            </div>
            <div className="rounded-lg border bg-secondary p-6 flex items-center justify-center">
              <div className="text-center">
                <Skeleton className="h-8 w-8 mx-auto mb-2" />
                <Skeleton className="h-4 w-56" />
              </div>
            </div>
          </section>
        </div>

        <div className="lg:col-span-4 flex flex-col gap-4">
          <Skeleton className="h-5 w-16" />
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="rounded-[var(--radius-widget)] bg-secondary p-3 flex flex-col gap-2"
            >
              <div className="flex items-center gap-1.5">
                <Skeleton className="h-4 w-4" />
                <Skeleton className="h-3 w-16" />
              </div>
              <Skeleton className="h-4 w-32" />
            </div>
          ))}
          <div className="rounded-[var(--radius-widget)] bg-secondary p-3 flex flex-col gap-2">
            <Skeleton className="h-3 w-16" />
            <div className="flex items-center gap-2">
              <Skeleton className="h-3 w-10" />
              <Skeleton className="h-5 w-12 rounded-full" />
            </div>
            <div className="flex items-center gap-1">
              <Skeleton className="h-3 w-8" />
              <Skeleton className="h-3 w-48" />
            </div>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <Skeleton className="h-3 w-40" />
        <Skeleton className="h-3 w-32" />
      </div>
    </div>
  );
}
