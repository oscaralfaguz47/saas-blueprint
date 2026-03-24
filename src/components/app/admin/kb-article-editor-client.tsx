"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import { KbArticleStatus, KbArticleType, KbVisibility } from "@prisma/client";

import { SafeMarkdown } from "@/components/markdown/safe-markdown";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/toast";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { generateSlug, isValidSlug } from "@/lib/slug";

import type { KbCategoryRow } from "./kb-admin-categories-section";

export type KbArticleEditorInitial = {
  id: string;
  title: string;
  slug: string;
  excerpt: string | null;
  bodyMarkdown: string;
  articleType: KbArticleType;
  visibility: KbVisibility;
  status: KbArticleStatus;
  isFeatured: boolean;
  sortOrder: number;
  categoryId: string;
  tags: string[];
};

type Props = {
  mode: "new" | "edit";
  articleId?: string;
  initialArticle?: KbArticleEditorInitial;
  canManage: boolean;
};

export function KbArticleEditorClient({ mode, articleId: initialId, initialArticle, canManage }: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const [categories, setCategories] = useState<KbCategoryRow[]>([]);
  const [articleId, setArticleId] = useState<string | null>(initialId ?? initialArticle?.id ?? null);

  const [title, setTitle] = useState(initialArticle?.title ?? "");
  const [slug, setSlug] = useState(initialArticle?.slug ?? "");
  const [slugManual, setSlugManual] = useState(!!initialArticle);
  const [excerpt, setExcerpt] = useState(initialArticle?.excerpt ?? "");
  const [categoryId, setCategoryId] = useState(initialArticle?.categoryId ?? "");
  const [articleType, setArticleType] = useState<KbArticleType>(
    initialArticle?.articleType ?? KbArticleType.GUIDE
  );
  const [visibility, setVisibility] = useState<KbVisibility>(
    initialArticle?.visibility ?? KbVisibility.PUBLIC
  );
  const [isFeatured, setIsFeatured] = useState(initialArticle?.isFeatured ?? false);
  const [sortOrder, setSortOrder] = useState(String(initialArticle?.sortOrder ?? 0));
  const [tagsStr, setTagsStr] = useState((initialArticle?.tags ?? []).join(", "));
  const [bodyMarkdown, setBodyMarkdown] = useState(initialArticle?.bodyMarkdown ?? "");
  const [status, setStatus] = useState<KbArticleStatus>(initialArticle?.status ?? KbArticleStatus.DRAFT);

  const [tab, setTab] = useState("edit");
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const tagsArray = tagsStr
    .split(",")
    .map((t) => t.trim())
    .filter(Boolean);

  const loadCategories = useCallback(async () => {
    try {
      const res = await apiFetch("/api/admin/knowledge-base/categories", { showToastOnError: false });
      if (!res.ok) return;
      const json = (await res.json()) as { data: { categories: KbCategoryRow[] } };
      setCategories(json.data.categories);
    } catch {
      /* ignore */
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    if (categories.length > 0 && !categoryId) {
      setCategoryId(categories[0].id);
    }
  }, [categories, categoryId]);

  useEffect(() => {
    if (initialArticle) {
      setStatus(initialArticle.status);
    }
  }, [initialArticle]);

  function onTitleChange(v: string) {
    setTitle(v);
    if (!slugManual) {
      try {
        if (v.trim()) setSlug(generateSlug(v));
        else setSlug("");
      } catch {
        setSlug("");
      }
    }
  }

  function parseSortOrder(): number | null {
    const n = parseInt(sortOrder, 10);
    if (Number.isNaN(n)) return null;
    return n;
  }

  function validateForSave(): string | null {
    if (!title.trim()) return "Title is required.";
    if (!slug.trim() || !isValidSlug(slug)) {
      return "Slug must use lowercase letters, numbers, and single hyphens only.";
    }
    if (!categoryId) return "Category is required.";
    const so = parseSortOrder();
    if (so === null) return "Sort order must be a whole number.";
    return null;
  }

  async function saveDraft() {
    setFormError(null);
    const v = validateForSave();
    if (v) {
      setFormError(v);
      return;
    }
    const so = parseSortOrder();
    if (so === null) return;

    setSaving(true);
    try {
      if (mode === "new" && !articleId) {
        const res = await apiFetch("/api/admin/knowledge-base/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            excerpt: excerpt.trim() || null,
            categoryId,
            articleType,
            visibility,
            isFeatured,
            sortOrder: so,
            bodyMarkdown,
            tags: tagsArray,
            status: KbArticleStatus.DRAFT,
          }),
          showToastOnError: false,
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
          data?: { article: { id: string } };
        };
        if (!res.ok) {
          setFormError(data.error?.message ?? "Article could not be saved.");
          return;
        }
        const id = data.data?.article.id;
        if (id) {
          setArticleId(id);
          addToast("success", "Draft saved.");
          router.replace(`/admin/knowledge-base/articles/${id}/edit`);
        }
        return;
      }

      const id = articleId ?? initialId;
      if (!id) {
        setFormError("Article is not ready to save.");
        return;
      }
      const res = await apiFetch(`/api/admin/knowledge-base/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          excerpt: excerpt.trim() || null,
          categoryId,
          articleType,
          visibility,
          isFeatured,
          sortOrder: so,
          bodyMarkdown,
          tags: tagsArray,
        }),
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setFormError(data.error?.message ?? "Article could not be saved.");
        return;
      }
      addToast("success", "Draft saved.");
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  async function publishArticle() {
    setFormError(null);
    const v = validateForSave();
    if (v) {
      setFormError(v);
      return;
    }
    if (!bodyMarkdown.trim()) {
      setFormError("Body is required to publish.");
      return;
    }
    const so = parseSortOrder();
    if (so === null) {
      setFormError("Sort order must be a whole number.");
      return;
    }

    setActionLoading("publish");
    try {
      if (mode === "new" && !articleId) {
        const res = await apiFetch("/api/admin/knowledge-base/articles", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title.trim(),
            slug: slug.trim(),
            excerpt: excerpt.trim() || null,
            categoryId,
            articleType,
            visibility,
            isFeatured,
            sortOrder: so,
            bodyMarkdown,
            tags: tagsArray,
            status: KbArticleStatus.PUBLISHED,
          }),
          showToastOnError: false,
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
          data?: { article: { id: string } };
        };
        if (!res.ok) {
          setFormError(data.error?.message ?? "Article could not be published.");
          return;
        }
        const id = data.data?.article.id;
        if (id) {
          setArticleId(id);
          setStatus(KbArticleStatus.PUBLISHED);
          addToast("success", "Article published.");
          router.replace(`/admin/knowledge-base/articles/${id}/edit`);
        }
        return;
      }

      const id = articleId ?? initialId;
      if (!id) {
        setFormError("Save a draft first.");
        return;
      }

      const patch = await apiFetch(`/api/admin/knowledge-base/articles/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          slug: slug.trim(),
          excerpt: excerpt.trim() || null,
          categoryId,
          articleType,
          visibility,
          isFeatured,
          sortOrder: so,
          bodyMarkdown,
          tags: tagsArray,
        }),
        showToastOnError: false,
      });
      if (!patch.ok) {
        const data = (await patch.json().catch(() => ({}))) as { error?: { message?: string } };
        setFormError(data.error?.message ?? "Could not update article before publishing.");
        return;
      }

      const pub = await apiFetch(`/api/admin/knowledge-base/articles/${id}/publish`, {
        method: "POST",
        showToastOnError: false,
      });
      const pubData = (await pub.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!pub.ok) {
        setFormError(pubData.error?.message ?? "Article could not be published.");
        return;
      }
      setStatus(KbArticleStatus.PUBLISHED);
      addToast("success", "Article published.");
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  async function postAction(path: string, key: string, successMsg: string) {
    const id = articleId ?? initialId;
    if (!id) return;
    setActionLoading(key);
    setFormError(null);
    try {
      const res = await apiFetch(`/api/admin/knowledge-base/articles/${id}${path}`, {
        method: "POST",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setFormError(data.error?.message ?? "Action failed.");
        return;
      }
      if (path === "/unpublish") setStatus(KbArticleStatus.DRAFT);
      if (path === "/archive") setStatus(KbArticleStatus.ARCHIVED);
      addToast("success", successMsg);
      router.refresh();
    } finally {
      setActionLoading(null);
    }
  }

  async function deleteArticle() {
    const id = articleId ?? initialId;
    if (!id) return;
    setActionLoading("delete");
    setFormError(null);
    try {
      const res = await apiFetch(`/api/admin/knowledge-base/articles/${id}`, {
        method: "DELETE",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        setFormError(data.error?.message ?? "Delete failed.");
        return;
      }
      addToast("success", "Article deleted.");
      router.push("/admin/knowledge-base");
    } finally {
      setActionLoading(null);
    }
  }

  if (!canManage && initialArticle) {
    return (
      <div className="space-y-6">
        <div>
          <Link
            href="/admin/knowledge-base"
            className="text-sm font-medium text-(--color-primary) hover:underline"
          >
            ← Knowledge Base
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-(--text-primary)">{initialArticle.title}</h1>
          <p className="mt-1 font-mono text-sm text-(--text-muted)">{initialArticle.slug}</p>
        </div>
        <dl className="grid gap-2 text-sm text-(--text-secondary) sm:grid-cols-2">
          <div>
            <dt className="text-(--text-muted)">Status</dt>
            <dd>{initialArticle.status}</dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">Visibility</dt>
            <dd>{initialArticle.visibility}</dd>
          </div>
          <div>
            <dt className="text-(--text-muted)">Type</dt>
            <dd>{initialArticle.articleType}</dd>
          </div>
        </dl>
        <div className="prose prose-sm max-w-none text-(--text-primary)">
          <SafeMarkdown markdown={initialArticle.bodyMarkdown} />
        </div>
      </div>
    );
  }

  if (!canManage) {
    return null;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link
          href="/admin/knowledge-base"
          className="text-sm font-medium text-(--color-primary) hover:underline"
        >
          ← Knowledge Base
        </Link>
      </div>

      {formError ? (
        <p className="rounded-md border border-(--color-danger-soft) bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
          {formError}
        </p>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-title">
            Title
          </label>
          <Input
            id="kb-a-title"
            value={title}
            onChange={(e) => onTitleChange(e.target.value)}
            disabled={saving || !!actionLoading}
            autoComplete="off"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-slug">
            Slug
          </label>
          <Input
            id="kb-a-slug"
            value={slug}
            onChange={(e) => {
              setSlugManual(true);
              setSlug(e.target.value);
            }}
            disabled={saving || !!actionLoading}
            className="font-mono"
            autoComplete="off"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-excerpt">
          Excerpt
        </label>
        <Textarea
          id="kb-a-excerpt"
          value={excerpt}
          onChange={(e) => setExcerpt(e.target.value)}
          disabled={saving || !!actionLoading}
          rows={2}
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-cat">
            Category
          </label>
          <select
            id="kb-a-cat"
            value={categoryId}
            onChange={(e) => setCategoryId(e.target.value)}
            disabled={saving || !!actionLoading}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm"
          >
            <option value="">Select category</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-type">
            Article type
          </label>
          <select
            id="kb-a-type"
            value={articleType}
            onChange={(e) => setArticleType(e.target.value as KbArticleType)}
            disabled={saving || !!actionLoading}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm"
          >
            {Object.values(KbArticleType).map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-vis">
            Visibility
          </label>
          <select
            id="kb-a-vis"
            value={visibility}
            onChange={(e) => setVisibility(e.target.value as KbVisibility)}
            disabled={saving || !!actionLoading}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm"
          >
            {Object.values(KbVisibility).map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-sort">
            Sort order
          </label>
          <Input
            id="kb-a-sort"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            disabled={saving || !!actionLoading}
            inputMode="numeric"
          />
        </div>
        <div className="flex items-end">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
            <input
              type="checkbox"
              checked={isFeatured}
              onChange={(e) => setIsFeatured(e.target.checked)}
              disabled={saving || !!actionLoading}
              className="h-4 w-4 rounded border-(--border-subtle)"
            />
            Featured
          </label>
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-tags">
          Tags
        </label>
        <Input
          id="kb-a-tags"
          value={tagsStr}
          onChange={(e) => setTagsStr(e.target.value)}
          disabled={saving || !!actionLoading}
          autoComplete="off"
        />
        <p className="mt-1 text-xs text-(--text-muted)">Comma-separated labels.</p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="mb-0">
          <TabsTrigger value="edit">Edit</TabsTrigger>
          <TabsTrigger value="preview">Preview</TabsTrigger>
        </TabsList>
        <TabsContent value="edit" className="p-4 sm:p-6">
          <label className="mb-1 block text-sm font-medium text-(--text-secondary)" htmlFor="kb-a-body">
            Body (Markdown)
          </label>
          <Textarea
            id="kb-a-body"
            value={bodyMarkdown}
            onChange={(e) => setBodyMarkdown(e.target.value)}
            disabled={saving || !!actionLoading}
            rows={18}
            className="font-mono text-sm"
          />
        </TabsContent>
        <TabsContent value="preview" className="p-4 sm:p-6">
          {bodyMarkdown.trim() ? (
            <div className="prose prose-sm max-w-none text-(--text-primary)">
              <SafeMarkdown markdown={bodyMarkdown} />
            </div>
          ) : (
            <p className="text-sm text-(--text-muted)">No content to preview.</p>
          )}
        </TabsContent>
      </Tabs>

      <div className="flex flex-wrap gap-2 border-t border-(--border-subtle) pt-4">
        <button
          type="button"
          onClick={() => void saveDraft()}
          disabled={saving || !!actionLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
        >
          {saving ? <Spinner size="sm" /> : null}
          Save as draft
        </button>
        <button
          type="button"
          onClick={() => void publishArticle()}
          disabled={saving || !!actionLoading}
          className="inline-flex items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
        >
          {actionLoading === "publish" ? <Spinner size="sm" /> : null}
          Publish
        </button>
        {(articleId ?? initialId) && status === KbArticleStatus.PUBLISHED ? (
          <button
            type="button"
            onClick={() => void postAction("/unpublish", "unpub", "Article unpublished.")}
            disabled={saving || !!actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            {actionLoading === "unpub" ? <Spinner size="sm" /> : null}
            Unpublish
          </button>
        ) : null}
        {(articleId ?? initialId) && status !== KbArticleStatus.ARCHIVED ? (
          <button
            type="button"
            onClick={() => void postAction("/archive", "arch", "Article archived.")}
            disabled={saving || !!actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-secondary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            {actionLoading === "arch" ? <Spinner size="sm" /> : null}
            Archive
          </button>
        ) : null}
        {(articleId ?? initialId) && status === KbArticleStatus.PUBLISHED ? (
          <button
            type="button"
            onClick={() => void postAction("/reindex", "reindex", "Search index updated.")}
            disabled={saving || !!actionLoading}
            className="inline-flex items-center gap-2 rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            {actionLoading === "reindex" ? <Spinner size="sm" /> : null}
            Reindex
          </button>
        ) : null}
        {(articleId ?? initialId) && status === KbArticleStatus.ARCHIVED ? (
          <button
            type="button"
            onClick={() => void deleteArticle()}
            disabled={saving || !!actionLoading}
            className="inline-flex items-center gap-2 rounded-lg bg-(--color-danger) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {actionLoading === "delete" ? <Spinner size="sm" /> : null}
            Delete
          </button>
        ) : null}
      </div>

    </div>
  );
}
