"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
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
} from "lucide-react";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  created_at: string;
  updated_at: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
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

export default function BackupDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [backup, setBackup] = useState<BackupDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Preview state
  const [previewData, setPreviewData] = useState<unknown>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  // Extract state
  const [extracting, setExtracting] = useState(false);

  // Delete state
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Restore URL state
  const [restoreUrl, setRestoreUrl] = useState<string | null>(null);
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const fetchBackup = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/backups/${id}`);
      if (res.status === 404) {
        setError("Backup not found");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch backup");
      const data: BackupDetail = await res.json();
      setBackup(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchBackup();
  }, [fetchBackup]);

  // Auto-load preview for JSON backups
  useEffect(() => {
    if (!backup || previewData || previewLoading) return;
    if (backup.json_key) {
      void loadPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [backup]);

  async function loadPreview() {
    try {
      setPreviewLoading(true);
      setPreviewError(null);
      const res = await fetch(`/api/backups/${id}/preview`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to load preview" }));
        throw new Error((data as { error: string }).error);
      }
      const data = await res.json() as { content: unknown };
      setPreviewData(data.content);
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Failed to load preview");
    } finally {
      setPreviewLoading(false);
    }
  }

  async function handleExtract() {
    try {
      setExtracting(true);
      setPreviewError(null);
      const res = await fetch(`/api/backups/${id}/extract`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Extraction failed" }));
        throw new Error((data as { error: string }).error);
      }
      // Refresh backup data to get the new json_key
      await fetchBackup();
      // Then load the preview
      await loadPreview();
    } catch (err) {
      setPreviewError(err instanceof Error ? err.message : "Extraction failed");
    } finally {
      setExtracting(false);
    }
  }

  async function handleDownload() {
    try {
      const res = await fetch(`/api/backups/${id}/download`);
      if (!res.ok) throw new Error("Failed to generate download URL");
      const data = await res.json() as { url: string };
      window.open(data.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Download failed");
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      const res = await fetch(`/api/backups/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete backup");
      router.push("/backups");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
      setDeleting(false);
    }
  }

  async function handleGenerateRestoreUrl() {
    if (!backup) return;
    try {
      setRestoreLoading(true);
      // Fetch the project to get its webhook token
      const res = await fetch(`/api/projects/${backup.project_id}`);
      if (!res.ok) throw new Error("Failed to fetch project");
      const project: { webhook_token: string } = await res.json();

      // Construct the restore URL
      const baseUrl = window.location.origin;
      const url = `${baseUrl}/api/restore/${backup.id}?token=${project.webhook_token}`;
      setRestoreUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to generate restore URL");
    } finally {
      setRestoreLoading(false);
    }
  }

  async function handleCopyRestoreUrl() {
    if (!restoreUrl) return;
    await navigator.clipboard.writeText(restoreUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // --- Loading state ---
  if (loading) {
    return (
      <AppShell breadcrumbs={[{ label: "Backups", href: "/backups" }, { label: "..." }]}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  // --- Error state ---
  if (error && !backup) {
    return (
      <AppShell breadcrumbs={[{ label: "Backups", href: "/backups" }, { label: "Error" }]}>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => router.push("/backups")}
          >
            Back to Backups
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!backup) return null;

  const isZip = !backup.is_single_json;
  const hasPreview = !!backup.json_key;
  const canExtract = isZip && !hasPreview;

  return (
    <AppShell
      breadcrumbs={[
        { label: "Backups", href: "/backups" },
        { label: backup.tag || backup.id.slice(0, 8) },
      ]}
    >
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => router.push("/backups")}
            >
              <ArrowLeft className="h-3.5 w-3.5 mr-1.5" />
              Back
            </Button>
            <div className="flex items-center gap-2">
              {isZip ? (
                <FileArchive className="h-5 w-5 text-muted-foreground" />
              ) : (
                <FileJson className="h-5 w-5 text-primary" />
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

        {/* Main content: left-right layout (8:4) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left column (8/12): JSON Preview + Restore URL */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            {/* JSON Preview section */}
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
                    Extract JSON from ZIP
                  </Button>
                )}
              </div>

              {/* Preview content */}
              {previewLoading ? (
                <div className="flex items-center justify-center py-8 rounded-lg border bg-secondary">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading preview...</span>
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
                    This is a ZIP archive. Click &ldquo;Extract JSON from ZIP&rdquo; to preview
                    the JSON content.
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

            {/* Restore URL section */}
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
                  {restoreUrl ? "Regenerate" : "Generate URL"}
                </Button>
              </div>

              {restoreUrl ? (
                <div className="rounded-lg border bg-card p-4 flex flex-col gap-3">
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground break-all">
                      {restoreUrl}
                    </code>
                    <Button
                      variant="outline"
                      size="sm"
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
                  <div className="text-xs text-muted-foreground space-y-1">
                    <p>
                      This URL contains the project&apos;s webhook token. The presigned download
                      link returned expires after <strong>15 minutes</strong>.
                    </p>
                    <p className="font-mono bg-muted/50 rounded px-2 py-1 break-all">
                      curl &quot;{restoreUrl}&quot;
                    </p>
                  </div>
                </div>
              ) : (
                <div className="rounded-lg border bg-secondary p-6 text-center">
                  <Link2 className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
                  <p className="text-sm text-muted-foreground">
                    Generate a restore URL for your AI agent to download this backup.
                  </p>
                </div>
              )}
            </section>
          </div>

          {/* Right column (4/12): Metadata + File info */}
          <div className="lg:col-span-4 flex flex-col gap-4">
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
            <MetadataItem
              icon={<Globe className="h-4 w-4" />}
              label="Sender"
              value={backup.sender_ip}
            />
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

            {/* File info */}
            <div className="rounded-lg border bg-card p-3 flex flex-col gap-2">
              <div className="flex items-center gap-1.5 text-muted-foreground">
                <span className="text-xs">File Info</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground text-xs">Type:</span>
                <Badge variant={isZip ? "secondary" : "default"} className="text-xs">
                  {isZip ? "ZIP Archive" : "JSON"}
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
                    <Badge variant="secondary" className="text-xs ml-1">extracted</Badge>
                  ) : null}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Error display */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

        {/* Metadata footer */}
        <section className="text-xs text-muted-foreground/60 flex items-center gap-4">
          <span className="font-mono">{backup.id}</span>
          <span>
            Updated {formatDate(backup.updated_at)}
          </span>
        </section>
      </div>
    </AppShell>
  );
}

// --- Helper component ---

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
    <div className="rounded-lg border bg-card p-3 flex flex-col gap-1">
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
      <a href={href} className="hover:ring-1 hover:ring-primary/30 rounded-lg transition-shadow">
        {content}
      </a>
    );
  }

  return content;
}
