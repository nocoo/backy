"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Timer,
  Play,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell } from "@/components/layout/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProjectWebhookPanel } from "@/components/project/project-webhook-panel";
import { ProjectRecentBackupsCard } from "@/components/project/project-recent-backups-card";
import { getCategoryIcon } from "@/lib/category-icons";

interface Project {
  id: string;
  name: string;
  description: string | null;
  allowed_ips: string | null;
  category_id: string | null;
  auto_backup_enabled: number;
  auto_backup_interval: number;
  auto_backup_webhook: string | null;
  auto_backup_headers_configured: boolean;
  created_at: string;
  updated_at: string;
}

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
}

interface BackupItem {
  id: string;
  project_id: string;
  project_name: string;
  environment: string | null;
  tag: string | null;
  file_size: number;
  is_single_json: number;
  file_type: string;
  created_at: string;}

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
  const [webhookToken, setWebhookToken] = useState<string | null>(null);

  // Edit state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [allowedIps, setAllowedIps] = useState("");
  const [categoryId, setCategoryId] = useState<string | null>(null);
  const [ipError, setIpError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);

  // Auto-backup state
  const [autoBackupEnabled, setAutoBackupEnabled] = useState(0);
  const [autoBackupInterval, setAutoBackupInterval] = useState(24);
  const [autoBackupWebhook, setAutoBackupWebhook] = useState("");
  const [autoBackupHeaderKey, setAutoBackupHeaderKey] = useState("");
  const [autoBackupHeaderValue, setAutoBackupHeaderValue] = useState("");
  // Track header configuration state
  const [userHasModifiedHeaders, setUserHasModifiedHeaders] = useState(false); // User touched header inputs
  const [headerValueVisible, setHeaderValueVisible] = useState(false);
  const [testingTrigger, setTestingTrigger] = useState(false);

  // Categories
  const [categories, setCategories] = useState<Category[]>([]);

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
      setCategoryId(data.category_id);
      setAutoBackupEnabled(data.auto_backup_enabled);
      setAutoBackupInterval(data.auto_backup_interval);
      setAutoBackupWebhook(data.auto_backup_webhook ?? "");
      // Note: actual header values are NOT returned (sanitized), so inputs stay empty
      setUserHasModifiedHeaders(false); // Reset modification flag on load
      // Note: actual header values are NOT returned (sanitized), so inputs stay empty
      // If user wants to change headers, they re-enter them entirely
      // Try to get webhook_token from sessionStorage (set after creation)
      const storedToken = sessionStorage.getItem(`project_token_${id}`);
      if (storedToken) {
        setWebhookToken(storedToken);
        // Clear from sessionStorage after loading (one-time transfer)
        sessionStorage.removeItem(`project_token_${id}`);
      }
      // Note: if token not in storage, it stays null - user needs to regenerate to see it
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch("/api/categories");
      if (!res.ok) return;
      const data: Category[] = await res.json();
      setCategories(data);
    } catch {
      // Non-critical
    }
  }, []);

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
    void fetchCategories();
    void fetchBackups();
  }, [fetchProject, fetchCategories, fetchBackups]);

  // Track dirty state
  useEffect(() => {
    if (!project) return;
    const nameChanged = name.trim() !== project.name;
    const descChanged = (description.trim() || null) !== (project.description ?? null);
    const ipsChanged = (allowedIps.trim() || null) !== (project.allowed_ips ?? null);
    const catChanged = categoryId !== project.category_id;
    const abEnabledChanged = autoBackupEnabled !== project.auto_backup_enabled;
    const abIntervalChanged = autoBackupInterval !== project.auto_backup_interval;
    const abWebhookChanged = (autoBackupWebhook.trim() || null) !== (project.auto_backup_webhook ?? null);
    // For header fields: only dirty if user actually modified them
    setDirty(nameChanged || descChanged || ipsChanged || catChanged || abEnabledChanged || abIntervalChanged || abWebhookChanged || userHasModifiedHeaders);
  }, [name, description, allowedIps, categoryId, autoBackupEnabled, autoBackupInterval, autoBackupWebhook, userHasModifiedHeaders, project]);

  async function handleSave() {
    if (!project || !dirty) return;
    setIpError(null);
    try {
      setSaving(true);

      // Build partial update payload - only include fields that actually changed
      const payload: Record<string, unknown> = {};
      const nameChanged = name.trim() !== project.name;
      const descChanged = (description.trim() || null) !== (project.description ?? null);
      const ipsChanged = (allowedIps.trim() || null) !== (project.allowed_ips ?? null);
      const catChanged = categoryId !== project.category_id;
      const abEnabledChanged = autoBackupEnabled !== project.auto_backup_enabled;
      const abIntervalChanged = autoBackupInterval !== project.auto_backup_interval;
      const abWebhookChanged = (autoBackupWebhook.trim() || null) !== (project.auto_backup_webhook ?? null);

      if (nameChanged) payload.name = name.trim();
      if (descChanged) payload.description = description.trim() || undefined;
      if (ipsChanged) payload.allowed_ips = allowedIps.trim() || null;
      if (catChanged) payload.category_id = categoryId;
      if (abEnabledChanged) payload.auto_backup_enabled = autoBackupEnabled;
      if (abIntervalChanged) payload.auto_backup_interval = autoBackupInterval;
      if (abWebhookChanged) payload.auto_backup_webhook = autoBackupWebhook.trim() || null;

      // For header fields: only send if user actually modified them
      if (userHasModifiedHeaders) {
        payload.auto_backup_header_key = autoBackupHeaderKey.trim() || null;
        payload.auto_backup_header_value = autoBackupHeaderValue.trim() || null;
      }

      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
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
      setCategoryId(updated.category_id);
      setAutoBackupEnabled(updated.auto_backup_enabled);
      setAutoBackupInterval(updated.auto_backup_interval);
      setAutoBackupWebhook(updated.auto_backup_webhook ?? "");
      setUserHasModifiedHeaders(false); // Reset modification flag
      // Clear header inputs after save (values are sanitized, not returned)
      setAutoBackupHeaderKey("");
      setAutoBackupHeaderValue("");
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
      setWebhookToken(data.webhook_token);
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

  async function handleTestTrigger() {
    try {
      setTestingTrigger(true);
      const res = await fetch(`/api/cron/trigger/${id}`, { method: "POST" });
      const data: { status: string; responseCode?: number; error?: string; durationMs?: number } = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to trigger backup");
      }

      if (data.status === "success") {
        toast.success(`Trigger successful (${data.responseCode}, ${data.durationMs}ms)`);
      } else {
        toast.error(`Trigger failed: ${data.error ?? `HTTP ${data.responseCode}`}`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to trigger backup");
    } finally {
      setTestingTrigger(false);
    }
  }

  if (loading) {
    return (
      <AppShell breadcrumbs={[{ label: "Projects", href: "/projects" }, { label: "..." }]}>
        <ProjectDetailSkeleton />
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
      <div className="flex flex-col gap-6">
        {/* Page header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-foreground">
              Project Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Configure your project and manage its webhook integration.
            </p>
          </div>
          <div className="text-xs text-muted-foreground/60 flex items-center gap-4">
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
          </div>
        </div>

        {/* Save bar - sticky when dirty */}
        {dirty && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm text-muted-foreground flex-1">You have unsaved changes.</p>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                setName(project.name);
                setDescription(project.description ?? "");
                setAllowedIps(project.allowed_ips ?? "");
                setCategoryId(project.category_id);
                setAutoBackupEnabled(project.auto_backup_enabled);
                setAutoBackupInterval(project.auto_backup_interval);
                setAutoBackupWebhook(project.auto_backup_webhook ?? "");
                setAutoBackupHeaderKey("");
                setAutoBackupHeaderValue("");
                setUserHasModifiedHeaders(false);
                setIpError(null);
              }}
              disabled={saving}
            >
              Reset
            </Button>
            <Button
              size="sm"
              onClick={() => void handleSave()}
              disabled={saving || !name.trim()}
            >
              {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
              Save Changes
            </Button>
          </div>
        )}

        {/* Two-column grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Left column */}
          <div className="flex flex-col gap-6">
            {/* General Settings Card */}
            <Card>
              <CardHeader>
                <CardTitle>General</CardTitle>
                <CardDescription>Basic project information and access control.</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
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
                  <Label>
                    Category{" "}
                    <span className="text-muted-foreground font-normal">(optional)</span>
                  </Label>
                  <Select
                    value={categoryId ?? "__none__"}
                    onValueChange={(v) => setCategoryId(v === "__none__" ? null : v)}
                    disabled={saving}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="No category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No category</SelectItem>
                      {categories.map((cat) => {
                        const Icon = getCategoryIcon(cat.icon);
                        return (
                          <SelectItem key={cat.id} value={cat.id}>
                            <span className="flex items-center gap-2">
                              <Icon className="h-3.5 w-3.5" style={{ color: cat.color }} />
                              {cat.name}
                            </span>
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
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
              </CardContent>
            </Card>

            {/* Auto Backup Card */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Timer className="h-4 w-4" />
                  Auto Backup
                </CardTitle>
                <CardDescription>
                  Automatically trigger backups on a schedule by calling an external webhook.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-4">
                {/* Enable toggle */}
                <div className="flex items-center gap-3">
                  <Label htmlFor="auto-backup-toggle" className="flex-1">
                    Enable Auto Backup
                  </Label>
                  <button
                    id="auto-backup-toggle"
                    role="switch"
                    aria-checked={autoBackupEnabled === 1}
                    onClick={() => setAutoBackupEnabled(autoBackupEnabled === 1 ? 0 : 1)}
                    className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 ${
                      autoBackupEnabled === 1 ? "bg-primary" : "bg-muted"
                    }`}
                    disabled={saving}
                  >
                    <span
                      className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-background shadow-lg ring-0 transition-transform ${
                        autoBackupEnabled === 1 ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>

                {autoBackupEnabled === 1 && (
                  <>
                    <div className="flex flex-col gap-2">
                      <Label>Interval</Label>
                      <Select
                        value={String(autoBackupInterval)}
                        onValueChange={(v) => setAutoBackupInterval(Number(v))}
                        disabled={saving}
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="1">Every hour</SelectItem>
                          <SelectItem value="12">Every 12 hours</SelectItem>
                          <SelectItem value="24">Every 24 hours</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ab-webhook">Webhook URL</Label>
                      <Input
                        id="ab-webhook"
                        type="url"
                        value={autoBackupWebhook}
                        onChange={(e) => setAutoBackupWebhook(e.target.value)}
                        placeholder="https://your-saas.com/api/backup/trigger"
                        disabled={saving}
                      />
                      <p className="text-xs text-muted-foreground">
                        The external endpoint to call when triggering a backup.
                      </p>
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ab-header-key">
                        Auth Header Name{" "}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <Input
                        id="ab-header-key"
                        value={autoBackupHeaderKey}
                        onChange={(e) => {
                          setAutoBackupHeaderKey(e.target.value);
                          if (!userHasModifiedHeaders) setUserHasModifiedHeaders(true);
                        }}
                        placeholder="e.g. X-Api-Key, Authorization"
                        disabled={saving}
                      />
                    </div>

                    <div className="flex flex-col gap-2">
                      <Label htmlFor="ab-header-value">
                        Auth Header Value{" "}
                        <span className="text-muted-foreground font-normal">(optional)</span>
                      </Label>
                      <div className="flex items-center gap-2">
                        <Input
                          id="ab-header-value"
                          type={headerValueVisible ? "text" : "password"}
                          value={autoBackupHeaderValue}
                          onChange={(e) => {
                            setAutoBackupHeaderValue(e.target.value);
                            if (!userHasModifiedHeaders) setUserHasModifiedHeaders(true);
                          }}
                          placeholder="Your API key or token"
                          disabled={saving}
                          className="flex-1"
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          aria-label={headerValueVisible ? "Hide auth header value" : "Show auth header value"}
                          onClick={() => setHeaderValueVisible(!headerValueVisible)}
                          className="shrink-0"
                        >
                          {headerValueVisible ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                        </Button>
                      </div>
                    </div>

                    {/* Test trigger button — only when saved config has a webhook */}
                    {project.auto_backup_enabled === 1 && project.auto_backup_webhook && !dirty && (
                      <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
                        <div className="flex-1">
                          <p className="text-sm font-medium text-foreground">Test Trigger</p>
                          <p className="text-xs text-muted-foreground">
                            Manually fire the webhook once. The result will appear in Cron Logs.
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void handleTestTrigger()}
                          disabled={testingTrigger}
                        >
                          {testingTrigger ? (
                            <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />
                          ) : (
                            <Play className="h-3.5 w-3.5 mr-1.5" />
                          )}
                          {testingTrigger ? "Triggering..." : "Test Now"}
                        </Button>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Right column */}
          <ProjectWebhookPanel
            webhookUrl={webhookUrl}
            webhookToken={webhookToken ?? ""}
            tokenVisible={tokenVisible}
            copied={copied}
            regenerating={regenerating}
            promptText={promptText}
            promptLoading={promptLoading}
            onCopy={handleCopy}
            onToggleTokenVisible={() => setTokenVisible(!tokenVisible)}
            onRegenerateToken={handleRegenerateToken}
            onShowPrompt={handleShowPrompt}
          />
        </div>

        {/* Recent Backups Card - full width */}
        <ProjectRecentBackupsCard
          projectId={project.id}
          backups={backups}
          backupsLoading={backupsLoading}
          downloading={downloading}
          onDownload={handleBackupDownload}
          onRefresh={fetchBackups}
          formatDate={formatDate}
          formatBytes={formatBytes}
        />

        {/* Danger Zone Card */}
        <Card className="border-destructive/30">
          <CardHeader>
            <CardTitle className="text-destructive">Danger Zone</CardTitle>
            <CardDescription>
              Deleting a project will permanently remove all associated backups.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}

function ProjectDetailSkeleton() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Skeleton className="h-6 w-40 mb-2" />
          <Skeleton className="h-4 w-72" />
        </div>
        <div className="flex items-center gap-4">
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-24" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left column - General + Auto Backup */}
        <div className="flex flex-col gap-6">
          {/* General Settings Card */}
          <div className="rounded-[var(--radius-card)] bg-secondary p-6">
            <Skeleton className="h-5 w-24 mb-1" />
            <Skeleton className="h-3 w-64 mb-6" />
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-12" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-32" />
                <Skeleton className="h-20 w-full rounded-md" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-28" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
              <div className="flex flex-col gap-2">
                <Skeleton className="h-3 w-36" />
                <Skeleton className="h-14 w-full rounded-md" />
                <Skeleton className="h-3 w-80" />
              </div>
            </div>
          </div>

          {/* Auto Backup Card */}
          <div className="rounded-[var(--radius-card)] bg-secondary p-6">
            <div className="flex items-center gap-2 mb-1">
              <Skeleton className="h-4 w-4" />
              <Skeleton className="h-5 w-24" />
            </div>
            <Skeleton className="h-3 w-72 mb-6" />
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-6 w-11 rounded-full" />
            </div>
          </div>
        </div>

        {/* Right column - Webhook Panel */}
        <div className="rounded-[var(--radius-card)] bg-secondary p-6">
          <Skeleton className="h-5 w-32 mb-1" />
          <Skeleton className="h-3 w-64 mb-6" />
          <div className="flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
            <div className="flex flex-col gap-2">
              <Skeleton className="h-3 w-28" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-32 rounded-md" />
              <Skeleton className="h-8 w-32 rounded-md" />
            </div>
          </div>
        </div>
      </div>

      {/* Recent Backups Card */}
      <div className="rounded-[var(--radius-card)] bg-secondary p-6">
        <Skeleton className="h-5 w-32 mb-1" />
        <Skeleton className="h-3 w-48 mb-4" />
        <div className="flex flex-col gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-4 py-3"
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-8 w-8 rounded-lg" />
                <div>
                  <div className="flex items-center gap-2">
                    <Skeleton className="h-4 w-24" />
                    <Skeleton className="h-5 w-12 rounded-full" />
                  </div>
                  <Skeleton className="h-3 w-32 mt-1" />
                </div>
              </div>
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      </div>

      {/* Danger Zone Card */}
      <div className="rounded-[var(--radius-card)] bg-secondary p-6 border border-destructive/30">
        <Skeleton className="h-5 w-28 mb-1" />
        <Skeleton className="h-3 w-80 mb-4" />
        <Skeleton className="h-8 w-32 rounded-md" />
      </div>
    </div>
  );
}
