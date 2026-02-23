"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { Archive, Download, Trash2, Loader2, ExternalLink } from "lucide-react";
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

export default function BackupsPage() {
  const [backups, setBackups] = useState<BackupWithProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<BackupWithProject | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchBackups = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/backups");
      if (!res.ok) throw new Error("Failed to fetch backups");
      const data: BackupWithProject[] = await res.json();
      setBackups(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchBackups();
  }, [fetchBackups]);

  async function handleDownload(backup: BackupWithProject) {
    try {
      setDownloading(backup.id);
      const res = await fetch(`/api/backups/${backup.id}/download`);
      if (!res.ok) throw new Error("Failed to generate download URL");
      const data: { url: string } = await res.json();
      window.open(data.url, "_blank");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDownloading(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const res = await fetch(`/api/backups/${deleteTarget.id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error("Failed to delete backup");
      setBackups((prev) => prev.filter((b) => b.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setDeleting(false);
    }
  }

  return (
    <AppShell breadcrumbs={[{ label: "Backups" }]}>
      <div className="flex flex-col gap-6">
        {/* Header */}
        <div>
          <h1 className="text-xl font-semibold text-foreground">Backups</h1>
          <p className="text-sm text-muted-foreground mt-1">
            All backup files received from your AI agents
          </p>
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
              onClick={() => void fetchBackups()}
            >
              Retry
            </Button>
          </div>
        ) : backups.length === 0 ? (
          <div className="rounded-lg border border-border bg-background/50 p-12 text-center">
            <Archive className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              No backups yet
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your AI agent to send backups via webhook.
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-2">
            {backups.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3 gap-3"
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Archive className="h-4 w-4" />
                  </div>
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
                    <div className="flex items-center gap-3 mt-0.5">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(backup.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(backup.file_size)}
                      </span>
                      <span className="text-xs text-muted-foreground/60 font-mono">
                        {backup.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0">
                  {backup.is_single_json === 1 && backup.json_key && (
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/backups/${backup.id}/preview`}>
                        <ExternalLink className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                  )}
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
        )}
      </div>

      {/* Delete confirmation dialog */}
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
    </AppShell>
  );
}
