import { useState } from "react";
import { useNavigate } from "react-router";
import { Loader2 } from "@nocoo/basalt/icons";
import { apiFetch, ApiError } from "@/lib/api";
import { Button } from "@nocoo/basalt/components/button";
import { Input } from "@nocoo/basalt/components/input";
import { Textarea } from "@nocoo/basalt/components/textarea";
import { Label } from "@nocoo/basalt/components/label";
import { LayerCard } from "@nocoo/basalt/components/layer-card";
import { PageHeader } from "@nocoo/basalt/components/page-header";

export function ProjectNewPage() {
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError("Project name is required");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      const res = await apiFetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName,
          description: description.trim() || undefined,
        }),
      });

      const project = (await res.json()) as {
        id: string;
        webhook_token: string;
      };
      sessionStorage.setItem(
        `project_token_${project.id}`,
        project.webhook_token,
      );
      navigate(`/projects/${project.id}`);
    } catch (err) {
      let message = "Unknown error";
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        message = body?.error ?? `Failed to create project (HTTP ${err.status})`;
      } else if (err instanceof Error) {
        message = err.message;
      }
      setError(message);
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-basalt-layout-lg">
      <PageHeader
        title="New Project"
        description="Create a project to generate a webhook endpoint for your AI agent."
      />
      <LayerCard>
      <form
        onSubmit={(e) => void handleSubmit(e)}
        className="flex flex-col gap-basalt-layout"
      >
        <div className="flex flex-col gap-2">
          <Label htmlFor="name">Name</Label>
          <Input
            id="name"
            placeholder="My SaaS App"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            autoFocus
            disabled={saving}
          />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="description">
            Description{" "}
            <span className="text-basalt-muted-foreground font-normal">
              (optional)
            </span>
          </Label>
          <Textarea
            id="description"
            placeholder="Brief description of what this project backs up..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            maxLength={500}
            rows={3}
            disabled={saving}
          />
        </div>

        {error && <p className="text-sm text-basalt-destructive">{error}</p>}

        <div className="flex items-center gap-3 pt-1">
          <Button type="submit" disabled={saving || !name.trim()}>
            {saving && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Create Project
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={() => navigate(-1)}
            disabled={saving}
          >
            Cancel
          </Button>
        </div>
      </form>
      </LayerCard>
    </div>
  );
}
