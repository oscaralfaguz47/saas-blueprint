"use client";

import { useCallback, useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { generateSlug, isValidSlug } from "@/lib/slug";

export type KbCategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  icon: string | null;
  isPublished: boolean;
  sortOrder: number;
  updatedAt: string;
  _count: { articles: number };
};

type Props = { canManage: boolean };

export function KbAdminCategoriesSection({ canManage }: Props) {
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const [categories, setCategories] = useState<KbCategoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<KbCategoryRow | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [slugManual, setSlugManual] = useState(false);
  const [description, setDescription] = useState("");
  const [icon, setIcon] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [isPublished, setIsPublished] = useState(false);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [deleteTarget, setDeleteTarget] = useState<KbCategoryRow | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/knowledge-base/categories", { showToastOnError: false });
      if (!res.ok) {
        setError("Categories could not be loaded.");
        return;
      }
      const json = (await res.json()) as { data: { categories: KbCategoryRow[] } };
      setCategories(json.data.categories);
    } catch {
      setError("Categories could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void load();
  }, [load]);

  function openCreate() {
    setEditing(null);
    setName("");
    setSlug("");
    setSlugManual(false);
    setDescription("");
    setIcon("");
    setSortOrder("0");
    setIsPublished(false);
    setFormError(null);
    setDialogOpen(true);
  }

  function openEdit(row: KbCategoryRow) {
    setEditing(row);
    setName(row.name);
    setSlug(row.slug);
    setSlugManual(true);
    setDescription(row.description ?? "");
    setIcon(row.icon ?? "");
    setSortOrder(String(row.sortOrder));
    setIsPublished(row.isPublished);
    setFormError(null);
    setDialogOpen(true);
  }

  function onNameChange(v: string) {
    setName(v);
    if (!slugManual) {
      try {
        if (v.trim()) setSlug(generateSlug(v));
        else setSlug("");
      } catch {
        setSlug("");
      }
    }
  }

  async function handleSave() {
    setFormError(null);
    if (!name.trim()) {
      setFormError("Name is required.");
      return;
    }
    if (!slug.trim() || !isValidSlug(slug)) {
      setFormError("Slug must use lowercase letters, numbers, and single hyphens only.");
      return;
    }
    let sort: number;
    try {
      sort = parseInt(sortOrder, 10);
      if (Number.isNaN(sort)) throw new Error();
    } catch {
      setFormError("Sort order must be a whole number.");
      return;
    }

    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        slug: slug.trim(),
        description: description.trim() || null,
        icon: icon.trim() || null,
        sortOrder: sort,
        isPublished,
      };
      if (editing) {
        const res = await apiFetch(`/api/admin/knowledge-base/categories/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          showToastOnError: false,
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        if (!res.ok) {
          setFormError(data.error?.message ?? "Category could not be updated.");
          return;
        }
        addToast("success", "Category updated.");
      } else {
        const res = await apiFetch("/api/admin/knowledge-base/categories", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          showToastOnError: false,
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        if (!res.ok) {
          setFormError(data.error?.message ?? "Category could not be created.");
          return;
        }
        addToast("success", "Category created.");
      }
      setDialogOpen(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleteError(null);
    setDeleting(true);
    try {
      const res = await apiFetch(`/api/admin/knowledge-base/categories/${deleteTarget.id}`, {
        method: "DELETE",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string };
      };
      if (!res.ok) {
        setDeleteError(data.error?.message ?? "Category could not be deleted.");
        return;
      }
      addToast("success", "Category deleted.");
      setDeleteTarget(null);
      await load();
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className="mt-10" aria-labelledby="kb-categories-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="kb-categories-heading" className="text-lg font-semibold text-(--text-primary)">
          Categories
        </h2>
        {canManage ? (
          <button
            type="button"
            onClick={openCreate}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            New category
          </button>
        ) : null}
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-(--color-danger)">{error}</p> : null}

      {!loading && !error && categories.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No categories"
            description="Create a category to organize help articles."
          />
        </div>
      ) : null}

      {!loading && !error && categories.length > 0 ? (
        <div className="mt-4 overflow-x-auto rounded-lg border border-(--border-subtle)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead className="text-right">Articles</TableHead>
                <TableHead>Published</TableHead>
                <TableHead className="text-right">Sort</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categories.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="font-medium text-(--text-primary)">{c.name}</TableCell>
                  <TableCell className="font-mono text-sm text-(--text-muted)">{c.slug}</TableCell>
                  <TableCell className="text-right tabular-nums">{c._count.articles}</TableCell>
                  <TableCell>
                    {c.isPublished ? (
                      <Badge variant="success">Yes</Badge>
                    ) : (
                      <Badge variant="secondary">No</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{c.sortOrder}</TableCell>
                  <TableCell>
                    {canManage ? (
                      <div className="flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          className="text-sm font-medium text-(--color-primary) hover:underline"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setDeleteTarget(c);
                            setDeleteError(null);
                          }}
                          className="text-sm font-medium text-(--color-danger) hover:underline"
                        >
                          Delete
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-(--text-muted)">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : null}

      <Dialog
        open={dialogOpen}
        onClose={() => {
          if (!saving) setDialogOpen(false);
        }}
        closeDisabled={saving}
        title={editing ? "Edit category" : "New category"}
        contentClassName="max-w-lg"
      >
        <div className="space-y-4">
          {formError ? (
            <p className="rounded-md border border-(--color-danger-soft) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
              {formError}
            </p>
          ) : null}
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-cat-name">
              Name
            </label>
            <Input
              id="kb-cat-name"
              value={name}
              onChange={(e) => onNameChange(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-cat-slug">
              Slug
            </label>
            <Input
              id="kb-cat-slug"
              value={slug}
              onChange={(e) => {
                setSlugManual(true);
                setSlug(e.target.value);
              }}
              disabled={saving}
              className="font-mono"
              autoComplete="off"
            />
          </div>
          <div>
            <label
              className="mb-1 block text-sm font-medium text-(--text-secondary)"
              htmlFor="kb-cat-desc"
            >
              Description
            </label>
            <Textarea
              id="kb-cat-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={saving}
              rows={3}
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-cat-icon">
              Icon
            </label>
            <Input
              id="kb-cat-icon"
              value={icon}
              onChange={(e) => setIcon(e.target.value)}
              disabled={saving}
              autoComplete="off"
            />
            <p className="mt-1 text-xs text-(--text-muted)">Short label or emoji shown in navigation.</p>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-cat-sort">
              Sort order
            </label>
            <Input
              id="kb-cat-sort"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
              disabled={saving}
              inputMode="numeric"
            />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              disabled={saving}
              className="h-4 w-4 rounded border-(--border-subtle)"
            />
            Published
          </label>
          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setDialogOpen(false)}
              disabled={saving}
              className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {saving ? <Spinner size="sm" /> : null}
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </Dialog>

      <Dialog
        open={!!deleteTarget}
        onClose={() => {
          if (!deleting) setDeleteTarget(null);
        }}
        closeDisabled={deleting}
        title="Delete category"
        description={
          deleteTarget
            ? `Delete “${deleteTarget.name}”? This cannot be undone.`
            : undefined
        }
      >
        {deleteError ? (
          <p className="mb-4 rounded-md border border-(--color-danger-soft) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
            {deleteError}
          </p>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={() => setDeleteTarget(null)}
            disabled={deleting}
            className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={deleting}
            className="inline-flex items-center gap-2 rounded-lg bg-(--color-danger) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {deleting ? <Spinner size="sm" /> : null}
            {deleting ? "Deleting…" : "Delete"}
          </button>
        </div>
      </Dialog>
    </section>
  );
}
