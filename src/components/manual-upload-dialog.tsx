"use client";

import { useState, useRef, useCallback } from "react";
import { Upload, FileJson, FileArchive, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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

interface Project {
  id: string;
  name: string;
}

interface ManualUploadDialogProps {
  /** If provided, locks the upload to this project */
  projectId?: string | undefined;
  /** Trigger element — if omitted, a default button is rendered */
  trigger?: React.ReactNode;
  /** Called after successful upload */
  onSuccess?: () => void;
}

function generateDefaultTag(): string {
  const now = new Date();
  const ts = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  return `Manual ${ts}`;
}

export function ManualUploadDialog({
  projectId: fixedProjectId,
  trigger,
  onSuccess,
}: ManualUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState(fixedProjectId ?? "");
  const [tag, setTag] = useState(generateDefaultTag);
  const [environment, setEnvironment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProjects = useCallback(async () => {
    if (fixedProjectId) return; // No need to fetch projects if locked
    try {
      setProjectsLoading(true);
      const res = await fetch("/api/projects");
      if (!res.ok) throw new Error("Failed to fetch projects");
      const data: Project[] = await res.json();
      setProjects(data);
    } catch {
      toast.error("Failed to load projects");
    } finally {
      setProjectsLoading(false);
    }
  }, [fixedProjectId]);

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen);
    if (nextOpen) {
      // Reset form
      setSelectedProjectId(fixedProjectId ?? "");
      setTag(generateDefaultTag());
      setEnvironment("");
      setFile(null);
      setDragOver(false);
      void fetchProjects();
    }
  }

  function validateFile(f: File): boolean {
    const name = f.name.toLowerCase();
    const type = f.type;
    const isJson = type === "application/json" || name.endsWith(".json");
    const isZip =
      type === "application/zip" ||
      type === "application/x-zip-compressed" ||
      name.endsWith(".zip");

    if (!isJson && !isZip) {
      toast.error("Only JSON and ZIP files are supported");
      return false;
    }
    if (f.size > 50 * 1024 * 1024) {
      toast.error("File is too large (max 50MB)");
      return false;
    }
    return true;
  }

  function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (f && validateFile(f)) {
      setFile(f);
    }
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(true);
  }

  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f && validateFile(f)) {
      setFile(f);
    }
  }

  function getFileIcon() {
    if (!file) return null;
    const name = file.name.toLowerCase();
    if (name.endsWith(".json")) return <FileJson className="h-5 w-5 text-amber-500" />;
    return <FileArchive className="h-5 w-5 text-blue-500" />;
  }

  function formatFileSize(bytes: number): string {
    if (bytes === 0) return "0 B";
    const k = 1024;
    const sizes = ["B", "KB", "MB", "GB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
  }

  async function handleUpload() {
    const targetProjectId = fixedProjectId ?? selectedProjectId;
    if (!targetProjectId) {
      toast.error("Please select a project");
      return;
    }
    if (!file) {
      toast.error("Please select a file");
      return;
    }

    try {
      setUploading(true);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("projectId", targetProjectId);
      if (tag.trim()) formData.append("tag", tag.trim());
      if (environment) formData.append("environment", environment);

      const res = await fetch("/api/backups/upload", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => ({ error: "Upload failed" }))) as { error: string };
        throw new Error(data.error);
      }

      toast.success("Backup uploaded successfully");
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  const isJsonFile = file?.name.toLowerCase().endsWith(".json") || file?.type === "application/json";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Upload className="h-4 w-4 mr-1.5" />
            Upload Backup
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Upload Backup</DialogTitle>
          <DialogDescription>
            Manually upload a JSON or ZIP backup file to a project.
            {isJsonFile && " JSON files will be automatically compressed into ZIP."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Project selector (only if not locked) */}
          {!fixedProjectId && (
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              {projectsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading projects...
                </div>
              ) : (
                <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select a project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {/* Tag */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="upload-tag">Tag</Label>
            <Input
              id="upload-tag"
              value={tag}
              onChange={(e) => setTag(e.target.value)}
              placeholder="e.g. Manual 2026-02-24"
              maxLength={200}
              disabled={uploading}
            />
          </div>

          {/* Environment */}
          <div className="flex flex-col gap-2">
            <Label>
              Environment{" "}
              <span className="text-muted-foreground font-normal">(optional)</span>
            </Label>
            <Select value={environment} onValueChange={setEnvironment}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="None" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">None</SelectItem>
                <SelectItem value="dev">dev</SelectItem>
                <SelectItem value="staging">staging</SelectItem>
                <SelectItem value="prod">prod</SelectItem>
                <SelectItem value="test">test</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* File drop zone */}
          <div className="flex flex-col gap-2">
            <Label>File</Label>
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`relative flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 cursor-pointer transition-colors ${
                dragOver
                  ? "border-primary bg-primary/5"
                  : file
                    ? "border-border bg-muted/30"
                    : "border-border hover:border-primary/50 hover:bg-muted/20"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,.zip,application/json,application/zip"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
              {file ? (
                <div className="flex items-center gap-3 w-full">
                  {getFileIcon()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{file.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                      {isJsonFile && " — will be compressed to ZIP"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFile(null);
                    }}
                    disabled={uploading}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ) : (
                <>
                  <Upload className="h-8 w-8 text-muted-foreground/40" />
                  <div className="text-center">
                    <p className="text-sm text-foreground">
                      Drop a file here or click to browse
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      JSON or ZIP, up to 50MB
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => setOpen(false)}
            disabled={uploading}
          >
            Cancel
          </Button>
          <Button
            onClick={() => void handleUpload()}
            disabled={uploading || !file || (!fixedProjectId && !selectedProjectId)}
          >
            {uploading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
