import { useState, useRef, useCallback, type ReactNode } from "react";
import { Upload, FileJson, FileArchive, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { apiFetch, apiJson, ApiError } from "@/lib/api";
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
  projectId?: string | undefined;
  trigger?: ReactNode;
  onSuccess?: () => void;
}

function generateDefaultTag(): string {
  const now = new Date();
  const ts = now.toISOString().replace("T", " ").replace(/\.\d+Z$/, "");
  return `Manual ${ts}`;
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / k ** i).toFixed(1))} ${sizes[i]}`;
}

export function ManualUploadDialog({
  projectId: fixedProjectId,
  trigger,
  onSuccess,
}: ManualUploadDialogProps) {
  const [open, setOpen] = useState(false);
  const [projects, setProjects] = useState<Project[]>([]);
  const [projectsLoading, setProjectsLoading] = useState(false);

  const [selectedProjectId, setSelectedProjectId] = useState(
    fixedProjectId ?? "",
  );
  const [tag, setTag] = useState(generateDefaultTag);
  const [environment, setEnvironment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchProjects = useCallback(async () => {
    if (fixedProjectId) return;
    try {
      setProjectsLoading(true);
      const data = await apiJson<Project[]>("/api/projects");
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
      setSelectedProjectId(fixedProjectId ?? "");
      setTag(generateDefaultTag());
      setEnvironment("");
      setFile(null);
      setDragOver(false);
      void fetchProjects();
    }
  }

  function validateFile(f: File): boolean {
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
    if (name.endsWith(".json"))
      return <FileJson className="h-5 w-5 text-warning" />;
    if (
      name.endsWith(".zip") ||
      name.endsWith(".gz") ||
      name.endsWith(".tgz") ||
      name.endsWith(".tar.gz")
    ) {
      return <FileArchive className="h-5 w-5 text-info" />;
    }
    return <Upload className="h-5 w-5 text-muted-foreground" />;
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

      await apiFetch("/api/backups/upload", {
        method: "POST",
        body: formData,
      });

      toast.success("Backup uploaded successfully");
      setOpen(false);
      onSuccess?.();
    } catch (err) {
      let message = "Upload failed";
      if (err instanceof ApiError) {
        const body = err.body as { error?: string } | null;
        message = body?.error ?? `Upload failed (HTTP ${err.status})`;
      } else if (err instanceof Error) {
        message = err.message;
      }
      toast.error(message);
    } finally {
      setUploading(false);
    }
  }

  const isJsonFile =
    file?.name.toLowerCase().endsWith(".json") ||
    file?.type === "application/json";

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
            Upload a backup file to a project. JSON, ZIP, GZ, and TGZ files
            support preview; other formats are stored as-is.
            {isJsonFile &&
              " JSON files will be automatically compressed into ZIP."}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {!fixedProjectId && (
            <div className="flex flex-col gap-2">
              <Label>Project</Label>
              {projectsLoading ? (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Loading projects...
                </div>
              ) : (
                <Select
                  value={selectedProjectId}
                  onValueChange={setSelectedProjectId}
                >
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

          <div className="flex flex-col gap-2">
            <Label>
              Environment{" "}
              <span className="text-muted-foreground font-normal">
                (optional)
              </span>
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
                accept="*/*"
                onChange={handleFileSelect}
                className="hidden"
                disabled={uploading}
              />
              {file ? (
                <div className="flex items-center gap-3 w-full">
                  {getFileIcon()}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {file.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {formatFileSize(file.size)}
                      {isJsonFile && " — will be compressed to ZIP"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    aria-label="Remove selected file"
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
                      Any file format, up to 50MB
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
            disabled={
              uploading ||
              !file ||
              (!fixedProjectId && !selectedProjectId)
            }
          >
            {uploading && <Loader2 className="h-4 w-4 mr-1.5 animate-spin" />}
            Upload
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
