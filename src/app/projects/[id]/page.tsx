"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import {
  Copy,
  Check,
  RefreshCw,
  Trash2,
  Loader2,
  Eye,
  EyeOff,
  Sparkles,
} from "lucide-react";
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
  created_at: string;
  updated_at: string;
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void fetchProject();
  }, [fetchProject]);

  // Track dirty state
  useEffect(() => {
    if (!project) return;
    const nameChanged = name.trim() !== project.name;
    const descChanged = (description.trim() || null) !== (project.description ?? null);
    setDirty(nameChanged || descChanged);
  }, [name, description, project]);

  async function handleSave() {
    if (!project || !dirty) return;
    try {
      setSaving(true);
      const res = await fetch(`/api/projects/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          description: description.trim() || undefined,
        }),
      });
      if (!res.ok) throw new Error("Failed to update project");
      const updated: Project = await res.json();
      setProject(updated);
      setName(updated.name);
      setDescription(updated.description ?? "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
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
      setError(err instanceof Error ? err.message : "Unknown error");
      setDeleting(false);
    }
  }

  async function handleCopy(text: string, type: "token" | "webhook" | "prompt") {
    await navigator.clipboard.writeText(text);
    setCopied(type);
    setTimeout(() => setCopied(null), 2000);
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
      setError(err instanceof Error ? err.message : "Unknown error");
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

        {/* Error display */}
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
            <p className="text-sm text-destructive">{error}</p>
          </div>
        )}

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
