"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import {
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
  Archive,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
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

interface Project {
  id: string;
  name: string;
  description: string | null;
  webhook_token: string;
  allowed_ips: string | null;
  created_at: string;
  updated_at: string;
}

interface BackupItem {
  id: string;
  project_id: string;
  project_name: string;
  environment: string | null;
  tag: string | null;
  file_size: number;
  is_single_json: number;
  created_at: string;
}

interface BackupListResponse {
  items: BackupItem[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
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

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [project, setProject] = useState<Project | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Edit state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [ipError, setIpError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Token visibility
  const [tokenVisible, setTokenVisible] = useState(false);
  const [copied, setCopied] = useState<"token" | "webhook" | "prompt" | null>(null);
  const [regenerating, setRegenerating] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Prompt
  const [promptText, setPromptText] = useState<string | null>(null);
  const [promptLoading, setPromptLoading] = useState(false);

  // Backups
  const [backups, setBackups] = useState<BackupListResponse | null>(null);
  const [backupsLoading, setBackupsLoading] = useState(true);
  const [downloading, setDownloading] = useState<string | null>(null);

  const fetchProject = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch(`/api/projects/${id}`);
      if (res.status === 404) {
        setError("Project not found");
        return;
      }
      if (!res.ok) throw new Error("Failed to fetch project");
      const data: Project = await res.json();
      setProject(data);
      setName(data.name);
      setDescription(data.description ?? "");
      setAllowedIps(data.allowed_ips ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchBackups = useCallback(async () => {
    try {
      setBackupsLoading(true);
      const res = await fetch(`/api/backups?projectId=${id}&pageSize=10`);
      if (!res.ok) return;
      const data: BackupListResponse = await res.json();
      setBackups(data);
    } catch {
      // Non-critical, silently fail
    } finally {
      setBackupsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchProject();
    void fetchBackups();
  }, [fetchProject, fetchBackups]);

  // Track dirty state
  useEffect(() => {
    if (!project) return;
    const nameChanged = name.trim() !== project.name;
    const descChanged = (description.trim() || null) !== (project.description ?? null);
    const ipsChanged = (allowedIps.trim() || null) !== (project.allowed_ips ?? null);
    setDirty(nameChanged || descChanged || ipsChanged);
  }, [name, description, allowedIps, project]);

  async function handleSave() {
    if (!project || !dirty) return;
    setIpError(null);
    try {
      setSaving(true);
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
          allowed_ips: allowedIps.trim() || null,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({ error: "Failed to update project" })) as { error: string; invalid?: string[] };
        if (data.invalid) {
          setIpError(`Invalid CIDR: ${data.invalid.join(", ")}`);
          return;
        }
        throw new Error(data.error);
      }
      const updated: Project = await res.json();
      setProject(updated);
      setName(updated.name);
      setDescription(updated.description ?? "");
      setAllowedIps(updated.allowed_ips ?? "");
      toast.success("Project settings saved");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save project");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerateToken() {
    if (!project) return;
    try {
      setRegenerating(true);
      const res = await fetch(`/api/projects/${id}/token`, { method: "POST" });
      if (!res.ok) throw new Error("Failed to regenerate token");
      const data: { webhook_token: string } = await res.json();
      setProject({ ...project, webhook_token: data.webhook_token });
      setTokenVisible(true);
      toast.success("Token regenerated successfully");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to regenerate token");
    } finally {
      setRegenerating(false);
    }
  }

  async function handleDelete() {
    try {
      setDeleting(true);
      const res = await fetch(`/api/projects/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete project");
      router.push("/projects");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete project");
      setDeleting(false);
    }
  }

  async function handleCopy(text: string, type: "token" | "webhook" | "prompt") {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
  }

  async function handleBackupDownload(backupId: string) {
    try {
      setDownloading(backupId);
      const res = await fetch(`/api/backups/${backupId}/download`);
      if (!res.ok) throw new Error("Failed to generate download URL");
      const data: { url: string } = await res.json();
      window.open(data.url, "_blank");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Download failed");
    } finally {
      setDownloading(null);
    }
  }

  async function handleShowPrompt() {
    if (promptText) return;
    try {
      setPromptLoading(true);
      const res = await fetch(`/api/projects/${id}/prompt`);
      if (!res.ok) throw new Error("Failed to fetch prompt");
      const data: { prompt: string } = await res.json();
      setPromptText(data.prompt);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load prompt");
    } finally {
      setPromptLoading(false);
    }
  }

  if (loading) {
    return (
      <AppShell breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "..." }]}>
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      </AppShell>
    );
  }

  if (error && !project) {
    return (
      <AppShell breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "Error" }]}>
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm text-destructive">{error}</p>
          <Button
            variant="outline"
            size="sm"
            className="mt-3"
            onClick={() => router.push("/projects")}
          >
            Back to Projects
          </Button>
        </div>
      </AppShell>
    );
  }

  if (!project) return null;

  const webhookUrl = `${window.location.origin}/api/webhook/${project.id}`;

  return (
    <AppShell breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: project.name }]}>
      <div className="flex flex-col gap-8 max-w-2xl">
        {/* Project settings */}
        <section className="flex flex-col gap-5">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Project Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your project and manage its webhook integration.
            </p>
          </div>

          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="name">Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="description">
                Description{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                disabled={saving}
              />
            </div>

            <div className="flex flex-col gap-2">
              <Label htmlFor="allowed-ips">
                Allowed IP Ranges{" "}
                <span className="text-muted-foreground font-normal">(optional)</span>
              </Label>
              <Textarea
                id="allowed-ips"
                value={allowedIps}
                onChange={(e) => { setAllowedIps(e.target.value); setIpError(null); }}
                placeholder="e.g. 1.2.3.4/8, 10.0.0.0/16, 192.168.1.100"
                rows={2}
                disabled={saving}
              />
              <p className="text-xs text-muted-foreground">
                Comma-separated list of IP or CIDR ranges allowed to send backups via webhook. Leave empty to allow all.
              </p>
              {ipError && (
                <p className="text-xs text-destructive">{ipError}</p>
              )}
            </div>

            {dirty && (
              <div className="flex items-center gap-3">
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || !name.trim()}
                >
                  {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
                  Save Changes
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    setName(project.name);
                    setDescription(project.description ?? "");
                    setAllowedIps(project.allowed_ips ?? "");
                    setIpError(null);
                  }}
                  disabled={saving}
                >
                  Reset
                </Button>
              </div>
            )}
          </div>
        </section>

        {/* Webhook integration */}
        <section className="flex flex-col gap-4">
          <div>
            <h2 className="text-base font-semibold text-foreground">
              Webhook Integration
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Use these credentials to send backups from your AI agent.
            </p>
          </div>

          {/* Webhook URL */}
          <div className="flex flex-col gap-2">
            <Label>Webhook URL</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground truncate">
                {webhookUrl}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopy(webhookUrl, "webhook")}
                className="shrink-0"
              >
                {copied === "webhook" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          </div>

          {/* Auth token */}
          <div className="flex flex-col gap-2">
            <Label>Authorization Token</Label>
            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-md border border-border bg-muted/50 px-3 py-2 text-xs font-mono text-foreground truncate">
                {tokenVisible
                  ? project.webhook_token
                  : "\u2022".repeat(24)}
              </code>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setTokenVisible(!tokenVisible)}
                className="shrink-0"
              >
                {tokenVisible ? (
                  <EyeOff className="h-3.5 w-3.5" />
                ) : (
                  <Eye className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleCopy(project.webhook_token, "token")}
                className="shrink-0"
              >
                {copied === "token" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
            <div className="flex items-center gap-2 mt-1">
              <Button
                variant="outline"
                size="sm"
                onClick={() => void handleRegenerateToken()}
                disabled={regenerating}
              >
                {regenerating ? (
                  <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                )}
                Regenerate Token
              </Button>
              <Badge variant="secondary">
                Bearer token
              </Badge>
            </div>
          </div>
        </section>

        {/* AI Agent Prompt */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                AI Agent Prompt
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Copy this prompt into your AI agent&apos;s instructions.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void handleShowPrompt()}
              disabled={promptLoading}
            >
              {promptLoading ? (
                <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5 mr-1.5" />
              )}
              {promptText ? "Refresh" : "Generate"}
            </Button>
          </div>

          {promptText && (
            <div className="relative">
              <pre className="rounded-md border border-border bg-muted/50 p-4 text-xs font-mono text-foreground whitespace-pre-wrap overflow-x-auto">
                {promptText}
              </pre>
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2"
                onClick={() => void handleCopy(promptText, "prompt")}
              >
                {copied === "prompt" ? (
                  <Check className="h-3.5 w-3.5" />
                ) : (
                  <Copy className="h-3.5 w-3.5" />
                )}
              </Button>
            </div>
          )}
        </section>

        {/* Recent Backups */}
        <section className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold text-foreground">
                Recent Backups
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {backups
                  ? `${backups.total} backup${backups.total !== 1 ? "s" : ""} in this project`
                  : "Loading..."}
              </p>
            </div>
            {backups && backups.total > 0 && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/backups?projectId=${project.id}`}>
                  View All
                </Link>
              </Button>
            )}
          </div>

          {backupsLoading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : backups && backups.items.length > 0 ? (
            <div className="flex flex-col gap-1">
              {backups.items.map((backup) => (
                <div
                  key={backup.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3 gap-3"
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
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
                        {backup.is_single_json === 1 && (
                          <Badge variant="secondary" className="text-xs">
                            JSON
                          </Badge>
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
                    <Button variant="outline" size="sm" asChild>
                      <Link href={`/backups/${backup.id}`}>
                        <Eye className="h-3.5 w-3.5" />
                      </Link>
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => void handleBackupDownload(backup.id)}
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
              <Archive className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                No backups yet. Configure your AI agent using the webhook above.
              </p>
            </div>
          )}
        </section>

        {/* Danger zone */}
        <section className="flex flex-col gap-4 rounded-lg border border-destructive/30 p-4">
          <div>
            <h2 className="text-base font-semibold text-destructive">
              Danger Zone
            </h2>
            <p className="text-sm text-muted-foreground mt-1">
              Deleting a project will permanently remove all associated backups.
            </p>
          </div>

          <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" className="w-fit">
                <Trash2 className="h-3.5 w-3.5 mr-1.5" />
                Delete Project
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Delete &ldquo;{project.name}&rdquo;?</DialogTitle>
                <DialogDescription>
                  This action cannot be undone. All backups associated with this
                  project will be permanently deleted from storage.
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
        </section>

        {/* Metadata */}
        <section className="text-xs text-muted-foreground/60 flex items-center gap-4">
          <span>
            Created{" "}
            {new Date(project.created_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span>
            Updated{" "}
            {new Date(project.updated_at).toLocaleDateString("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </span>
          <span className="font-mono">{project.id}</span>
        </section>
      </div>
    </AppShell>
  );
}
