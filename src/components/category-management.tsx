"use client";

import { useState, useEffect, useCallback } from "react";
import { Plus, Pencil, Trash2, Loader2, Settings2 } from "lucide-react";
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
import { CATEGORY_ICONS, CATEGORY_COLORS, getCategoryIcon } from "@/lib/category-icons";

interface Category {
  id: string;
  name: string;
  color: string;
  icon: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface CategoryManagementProps {
  /** Called when categories are modified so parents can refresh */
  onCategoriesChanged?: () => void;
}

/**
 * Dialog for managing project categories — create, edit, delete.
 */
export function CategoryManagement({ onCategoriesChanged }: CategoryManagementProps) {
  const [open, setOpen] = useState(false);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(false);

  // Form state for create/edit
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formColor, setFormColor] = useState(CATEGORY_COLORS[0]);
  const [formIcon, setFormIcon] = useState("folder");
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);

  // Delete confirmation
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fetchCategories = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/categories");
      if (!res.ok) throw new Error("Failed to fetch categories");
      const data: Category[] = await res.json();
      setCategories(data);
    } catch {
      toast.error("Failed to load categories");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (open) {
      void fetchCategories();
    }
  }, [open, fetchCategories]);

  function resetForm() {
    setEditingId(null);
    setFormName("");
    setFormColor(CATEGORY_COLORS[0]);
    setFormIcon("folder");
    setShowForm(false);
  }

  function startCreate() {
    resetForm();
    setShowForm(true);
  }

  function startEdit(cat: Category) {
    setEditingId(cat.id);
    setFormName(cat.name);
    setFormColor(cat.color);
    setFormIcon(cat.icon);
    setShowForm(true);
  }

  async function handleSave() {
    if (!formName.trim()) {
      toast.error("Name is required");
      return;
    }

    try {
      setSaving(true);

      if (editingId) {
        // Update existing
        const res = await fetch(`/api/categories/${editingId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            color: formColor,
            icon: formIcon,
          }),
        });
        if (!res.ok) throw new Error("Failed to update category");
        toast.success("Category updated");
      } else {
        // Create new
        const res = await fetch("/api/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: formName.trim(),
            color: formColor,
            icon: formIcon,
          }),
        });
        if (!res.ok) throw new Error("Failed to create category");
        toast.success("Category created");
      }

      resetForm();
      await fetchCategories();
      onCategoriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save category");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      setDeletingId(id);
      const res = await fetch(`/api/categories/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete category");

      toast.success("Category deleted");
      await fetchCategories();
      onCategoriesChanged?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete category");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings2 className="h-4 w-4 mr-1.5" />
          Categories
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Manage Categories</DialogTitle>
          <DialogDescription>
            Create categories to organize your projects. Each category has a name, color, and icon.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2 max-h-[60vh] overflow-y-auto">
          {/* Category list */}
          {loading ? (
            <div className="flex items-center justify-center py-6">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : categories.length === 0 && !showForm ? (
            <div className="rounded-lg border border-border bg-background/50 p-6 text-center">
              <p className="text-sm text-muted-foreground">
                No categories yet. Create one to start organizing your projects.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-1.5">
              {categories.map((cat) => {
                const IconComponent = getCategoryIcon(cat.icon);
                const isDeleting = deletingId === cat.id;
                return (
                  <div
                    key={cat.id}
                    className="flex items-center justify-between rounded-lg border border-border bg-background/50 px-3 py-2.5"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div
                        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md"
                        style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                      >
                        <IconComponent className="h-3.5 w-3.5" />
                      </div>
                      <span className="text-sm font-medium text-foreground truncate">
                        {cat.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => startEdit(cat)}
                        disabled={isDeleting}
                      >
                        <Pencil className="h-3 w-3" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-xs"
                        onClick={() => void handleDelete(cat.id)}
                        disabled={isDeleting}
                        className="text-destructive hover:text-destructive"
                      >
                        {isDeleting ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <Trash2 className="h-3 w-3" />
                        )}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Create/Edit form */}
          {showForm && (
            <div className="flex flex-col gap-3 rounded-lg border border-border bg-muted/30 p-4">
              <p className="text-sm font-medium text-foreground">
                {editingId ? "Edit Category" : "New Category"}
              </p>

              {/* Name input */}
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="cat-name" className="text-xs">Name</Label>
                <Input
                  id="cat-name"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="e.g. Production, Internal Tools"
                  maxLength={50}
                  disabled={saving}
                  autoFocus
                />
              </div>

              {/* Color picker */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Color</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_COLORS.map((color) => (
                    <button
                      key={color}
                      type="button"
                      onClick={() => setFormColor(color)}
                      className={`h-7 w-7 rounded-md border-2 transition-all ${
                        formColor === color
                          ? "border-foreground scale-110"
                          : "border-transparent hover:border-muted-foreground/30"
                      }`}
                      style={{ backgroundColor: color }}
                      disabled={saving}
                      title={color}
                    />
                  ))}
                </div>
              </div>

              {/* Icon picker */}
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">Icon</Label>
                <div className="flex flex-wrap gap-1.5">
                  {CATEGORY_ICONS.map((entry) => {
                    const Icon = entry.icon;
                    return (
                      <button
                        key={entry.name}
                        type="button"
                        onClick={() => setFormIcon(entry.name)}
                        className={`flex h-8 w-8 items-center justify-center rounded-md border transition-all ${
                          formIcon === entry.name
                            ? "border-foreground bg-accent"
                            : "border-transparent hover:border-muted-foreground/30 hover:bg-muted/50"
                        }`}
                        disabled={saving}
                        title={entry.label}
                      >
                        <Icon className="h-4 w-4" style={{ color: formColor }} />
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Form actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  onClick={() => void handleSave()}
                  disabled={saving || !formName.trim()}
                >
                  {saving && <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />}
                  {editingId ? "Update" : "Create"}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={resetForm}
                  disabled={saving}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="flex-row justify-between sm:justify-between">
          {!showForm && (
            <Button size="sm" variant="outline" onClick={startCreate}>
              <Plus className="h-3.5 w-3.5 mr-1.5" />
              Add Category
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setOpen(false)}
          >
            Done
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
