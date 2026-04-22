import Link from "next/link";
import { Archive, Download, Eye, Loader2 } from "lucide-react";
import { ManualUploadDialog } from "@/components/manual-upload-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

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
  backups: {
    items: ProjectRecentBackupItem[];
    total: number;
  } | null;
  backupsLoading: boolean;
  downloading: string | null;
  onDownload: (backupId: string) => void | Promise<void>;
  onRefresh: () => void | Promise<void>;
  formatDate: (date: string) => string;
  formatBytes: (bytes: number) => string;
}

export function ProjectRecentBackupsCard({
  projectId,
  backups,
  backupsLoading,
  downloading,
  onDownload,
  onRefresh,
  formatDate,
  formatBytes,
}: ProjectRecentBackupsCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recent Backups</CardTitle>
        <CardDescription>
          {backups
            ? `${backups.total} backup${backups.total !== 1 ? "s" : ""} in this project`
            : "Loading..."}
        </CardDescription>
        {backups && backups.total > 0 && (
          <CardAction className="flex items-center gap-2">
            <ManualUploadDialog projectId={projectId} onSuccess={() => void onRefresh()} />
            <Button variant="outline" size="sm" asChild>
              <Link href={`/backups?projectId=${projectId}`}>View All</Link>
            </Button>
          </CardAction>
        )}
      </CardHeader>
      <CardContent>
        {backupsLoading ? (
          <div className="flex items-center justify-center py-6">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : backups && backups.items.length > 0 ? (
          <div className="flex flex-col gap-1">
            {backups.items.map((backup) => (
              <div
                key={backup.id}
                className="flex items-center justify-between gap-3 rounded-lg border border-border bg-background/50 px-4 py-3"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <Archive className="h-3.5 w-3.5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      {backup.tag && (
                        <span className="text-sm font-medium text-foreground">
                          {backup.tag}
                        </span>
                      )}
                      {backup.environment && (
                        <Badge variant="secondary" className="text-xs">
                          {backup.environment}
                        </Badge>
                      )}
                      {backup.file_type && (
                        <Badge
                          variant={backup.file_type === "json" ? "default" : "secondary"}
                          className="text-xs"
                        >
                          {({ json: "JSON", zip: "ZIP", gz: "GZ", tgz: "TGZ" }[backup.file_type]) || backup.file_type.toUpperCase()}
                        </Badge>
                      )}
                    </div>
                    <div className="mt-0.5 flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">
                        {formatDate(backup.created_at)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {formatBytes(backup.file_size)}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground/60">
                        {backup.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="outline" size="sm" asChild>
                    <Link
                      href={`/backups/${backup.id}`}
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
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-background/50 p-8 text-center">
            <Archive className="mx-auto mb-2 h-8 w-8 text-muted-foreground/40" />
            <p className="text-sm text-muted-foreground">
              No backups yet. Configure your AI agent using the webhook above.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
