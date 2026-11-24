import { useState } from "react";
import { Link } from "react-router";
import { Archive, Download, Eye, Loader2, Trash2 } from "@nocoo/basalt/icons";
import { ManualUploadDialog } from "@/components/manual-upload-dialog";
import { Badge } from "@nocoo/basalt/components/badge";
import { Button } from "@nocoo/basalt/components/button";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@nocoo/basalt/components/dialog";

interface ProjectRecentBackupItem {
  id: string;
  environment: string | null;
  tag: string | null;
  file_size: number;
  file_type: string;
  created_at: string;
}

interface ProjectRecentBackupsCardProps {
  projectId: string;
  backups: { items: ProjectRecentBackupItem[]; total: number } | null;
  backupsLoading: boolean;
  downloading: string | null;
  deleting: string | null;
  onDownload: (backupId: string) => void | Promise<void>;
  onDelete: (backupId: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  formatDate: (date: string) => string;
  formatBytes: (bytes: number) => string;
}

const FILE_TYPE_LABELS: Record<string, string> = {
  json: "JSON",
  zip: "ZIP",
  gz: "GZ",
  tgz: "TGZ",
};

export function ProjectRecentBackupsCard({
  projectId,
  backups,
  backupsLoading,
  downloading,
  deleting,
  onDownload,
  onDelete,
  onRefresh,
  formatDate,
  formatBytes,
}: ProjectRecentBackupsCardProps) {
  const [deleteTarget, setDeleteTarget] = useState<ProjectRecentBackupItem | null>(null);

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Parent surfaces the error toast.
    }
  }

  return (
    <LayerCard>
      <LayerCard.Header>
        <div className="flex w-full items-center justify-between gap-basalt-layout">
          <div>
            <h2 className="text-basalt-lg font-semibold">Recent Backups</h2>
            <p className="text-basalt-sm text-basalt-muted-foreground">
              {backups
                ? `${backups.total} backup${backups.total !== 1 ? "s" : ""} in this project`
                : "Loading..."}
            </p>
          </div>
          {backups && backups.total > 0 ? (
            <div className="flex items-center gap-basalt-space-lg">
              <ManualUploadDialog projectId={projectId} onSuccess={() => void onRefresh()} />
              <Button variant="outline" size="sm" asChild>
                <Link to={`/backups?projectId=${encodeURIComponent(projectId)}`}>View All</Link>
              </Button>
            </div>
          ) : null}
        </div>
      </LayerCard.Header>
      <LayerCard.Body>
        {backupsLoading ? (
          <div className="flex items-center justify-center py-basalt-layout-lg">
            <Loader2 className="h-4 w-4 animate-spin text-basalt-muted-foreground" />
          </div>
        ) : backups && backups.items.length > 0 ? (
          <div className="flex flex-col gap-basalt-space-sm">
            {backups.items.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between gap-basalt-layout rounded-basalt-md bg-basalt-control px-basalt-card py-basalt-card-sm"
              >
                <div className="flex min-w-0 flex-1 items-center gap-basalt-layout">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-basalt-md text-basalt-primary">
                    <Archive className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-basalt-space-lg">
                      {backup.tag ? (
                        <span className="text-basalt-base font-medium">{backup.tag}</span>
                      ) : null}
                      {backup.environment ? (
                        <Badge tone="neutral" className="text-basalt-xs">
                          {backup.environment}
                        </Badge>
                      ) : null}
                      {backup.file_type ? (
                        <Badge tone={backup.file_type === "json" ? "info" : "neutral"}>
                          {FILE_TYPE_LABELS[backup.file_type] ?? backup.file_type.toUpperCase()}
                        </Badge>
                      ) : null}
                    </div>
                    <div className="mt-basalt-space-sm flex items-center gap-basalt-layout text-basalt-xs text-basalt-muted-foreground">
                      <span>{formatDate(backup.created_at)}</span>
                      <span>{formatBytes(backup.file_size)}</span>
                      <span className="font-mono">{backup.id.slice(0, 8)}</span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-basalt-space-sm">
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
                    onClick={() => void onDownload(backup.id)}
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
                    disabled={deleting === backup.id}
                  >
                    {deleting === backup.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5 text-basalt-destructive" />
                    )}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <LayerCard.Empty
            icon={<Archive className="h-8 w-8" />}
            title="No backups yet"
            description="Configure your AI agent using the webhook above."
          />
        )}
      </LayerCard.Body>

      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Backup?</DialogTitle>
            <DialogDescription>
              This will permanently delete this backup file from storage. This action cannot be
              undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={!!deleting}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => void handleConfirmDelete()}
              disabled={!!deleting}
            >
              {deleting ? <Loader2 className="mr-basalt-space-md h-4 w-4 animate-spin" /> : null}
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </LayerCard>
  );
}
