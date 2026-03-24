"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { KbArticleStatus, KbArticleType, KbVisibility } from "@prisma/client";

import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/components/ui/toast";
import { useApiFetch } from "@/hooks/use-api-fetch";

import type { KbCategoryRow } from "./kb-admin-categories-section";

type ArticleRow = {
  id: string;
  title: string;
  slug: string;
  articleType: KbArticleType;
  visibility: KbVisibility;
  status: KbArticleStatus;
  isFeatured: boolean;
  publishedAt: string | null;
  lastIndexedAt: string | null;
  updatedAt: string;
  category: { id: string; name: string; slug: string };
};

type Props = { canManage: boolean };

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All statuses" },
  { value: "DRAFT", label: "Draft" },
  { value: "PUBLISHED", label: "Published" },
  { value: "ARCHIVED", label: "Archived" },
];

const VIS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All visibility" },
  { value: "PUBLIC", label: "Public" },
  { value: "AUTHENTICATED", label: "Authenticated" },
  { value: "INTERNAL", label: "Internal" },
];

const TYPE_OPTIONS: Array<{ value: string; label: string }> = [
  { value: "", label: "All types" },
  ...Object.values(KbArticleType).map((v) => ({ value: v, label: v })),
];

function statusBadge(status: KbArticleStatus) {
  if (status === "PUBLISHED") return <Badge variant="success">Published</Badge>;
  if (status === "ARCHIVED") return <Badge variant="secondary">Archived</Badge>;
  return <Badge variant="warning">Draft</Badge>;
}

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return "—";
  }
}

export function KbAdminArticlesSection({ canManage }: Props) {
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const [categories, setCategories] = useState<KbCategoryRow[]>([]);
  const [items, setItems] = useState<ArticleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [total, setTotal] = useState(0);
  const limit = 20;

  const [filterStatus, setFilterStatus] = useState("");
  const [filterVisibility, setFilterVisibility] = useState("");
  const [filterType, setFilterType] = useState("");
  const [filterCategoryId, setFilterCategoryId] = useState("");
  const [filterFeatured, setFilterFeatured] = useState("");
  const [filterQ, setFilterQ] = useState("");

  const [actionId, setActionId] = useState<string | null>(null);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", String(limit));
    if (filterStatus) p.set("status", filterStatus);
    if (filterVisibility) p.set("visibility", filterVisibility);
    if (filterType) p.set("articleType", filterType);
    if (filterCategoryId) p.set("categoryId", filterCategoryId);
    if (filterFeatured === "true") p.set("isFeatured", "true");
    if (filterFeatured === "false") p.set("isFeatured", "false");
    if (filterQ.trim()) p.set("q", filterQ.trim());
    return p.toString();
  }, [
    page,
    limit,
    filterStatus,
    filterVisibility,
    filterType,
    filterCategoryId,
    filterFeatured,
    filterQ,
  ]);

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

  const loadArticles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/knowledge-base/articles?${queryString}`, {
        showToastOnError: false,
      });
      if (!res.ok) {
        setError("Articles could not be loaded.");
        return;
      }
      const json = (await res.json()) as {
        data: {
          items: ArticleRow[];
          pagination: { page: number; total: number; totalPages: number };
        };
      };
      setItems(json.data.items);
      setTotalPages(json.data.pagination.totalPages);
      setTotal(json.data.pagination.total);
    } catch {
      setError("Articles could not be loaded.");
    } finally {
      setLoading(false);
    }
  }, [apiFetch, queryString]);

  useEffect(() => {
    void loadCategories();
  }, [loadCategories]);

  useEffect(() => {
    void loadArticles();
  }, [loadArticles]);

  async function postAction(path: string, articleId: string, successMsg: string) {
    setActionId(articleId);
    try {
      const res = await apiFetch(`/api/admin/knowledge-base/articles/${articleId}${path}`, {
        method: "POST",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        addToast("error", data.error?.message ?? "Action failed.");
        return;
      }
      addToast("success", successMsg);
      await loadArticles();
    } finally {
      setActionId(null);
    }
  }

  async function deleteArticle(articleId: string) {
    setActionId(articleId);
    try {
      const res = await apiFetch(`/api/admin/knowledge-base/articles/${articleId}`, {
        method: "DELETE",
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
      if (!res.ok) {
        addToast("error", data.error?.message ?? "Delete failed.");
        return;
      }
      addToast("success", "Article deleted.");
      await loadArticles();
    } finally {
      setActionId(null);
    }
  }

  return (
    <section className="mt-12" aria-labelledby="kb-articles-heading">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id="kb-articles-heading" className="text-lg font-semibold text-(--text-primary)">
          Articles
        </h2>
        {canManage ? (
          <ButtonLink href="/admin/knowledge-base/articles/new">New article</ButtonLink>
        ) : null}
      </div>

      <div className="mt-4 grid gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <div>
          <label className="mb-1 block text-xs font-medium text-(--text-muted)" htmlFor="kb-f-status">
            Status
          </label>
          <select
            id="kb-f-status"
            value={filterStatus}
            onChange={(e) => {
              setPage(1);
              setFilterStatus(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            {STATUS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--text-muted)" htmlFor="kb-f-vis">
            Visibility
          </label>
          <select
            id="kb-f-vis"
            value={filterVisibility}
            onChange={(e) => {
              setPage(1);
              setFilterVisibility(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            {VIS_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--text-muted)" htmlFor="kb-f-type">
            Type
          </label>
          <select
            id="kb-f-type"
            value={filterType}
            onChange={(e) => {
              setPage(1);
              setFilterType(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            {TYPE_OPTIONS.map((o) => (
              <option key={o.value || "all"} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--text-muted)" htmlFor="kb-f-cat">
            Category
          </label>
          <select
            id="kb-f-cat"
            value={filterCategoryId}
            onChange={(e) => {
              setPage(1);
              setFilterCategoryId(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            <option value="">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-(--text-muted)" htmlFor="kb-f-feat">
            Featured
          </label>
          <select
            id="kb-f-feat"
            value={filterFeatured}
            onChange={(e) => {
              setPage(1);
              setFilterFeatured(e.target.value);
            }}
            className="h-10 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm text-(--text-primary)"
          >
            <option value="">Any</option>
            <option value="true">Featured</option>
            <option value="false">Not featured</option>
          </select>
        </div>
        <div className="sm:col-span-2 xl:col-span-1">
          <label className="mb-1 block text-xs font-medium text-(--text-muted)" htmlFor="kb-f-q">
            Search
          </label>
          <Input
            id="kb-f-q"
            value={filterQ}
            onChange={(e) => setFilterQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                void loadArticles();
              }
            }}
            className="h-10"
            autoComplete="off"
          />
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => {
            setPage(1);
            void loadArticles();
          }}
          className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-3 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Apply filters
        </button>
        <span className="text-sm text-(--text-muted)">
          {total} {total === 1 ? "article" : "articles"}
        </span>
      </div>

      {loading ? (
        <div className="mt-4 space-y-2">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-full" />
        </div>
      ) : null}

      {error ? <p className="mt-4 text-sm text-(--color-danger)">{error}</p> : null}

      {!loading && !error && items.length === 0 ? (
        <div className="mt-4">
          <EmptyState
            title="No articles"
            description="Adjust filters or create an article to get started."
          />
        </div>
      ) : null}

      {!loading && !error && items.length > 0 ? (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-(--border-subtle)">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Title</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Visibility</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Featured</TableHead>
                  <TableHead>Published</TableHead>
                  <TableHead>Indexed</TableHead>
                  <TableHead>Updated</TableHead>
                  <TableHead className="min-w-[200px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="max-w-[200px]">
                      <div className="font-medium text-(--text-primary)">{a.title}</div>
                      <div className="font-mono text-xs text-(--text-muted)">{a.slug}</div>
                    </TableCell>
                    <TableCell className="text-(--text-secondary)">{a.category.name}</TableCell>
                    <TableCell>{a.articleType}</TableCell>
                    <TableCell>{a.visibility}</TableCell>
                    <TableCell>{statusBadge(a.status)}</TableCell>
                    <TableCell>
                      {a.isFeatured ? <Badge variant="success">Yes</Badge> : <Badge variant="secondary">No</Badge>}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-(--text-muted)">
                      {fmtDate(a.publishedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-(--text-muted)">
                      {fmtDate(a.lastIndexedAt)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-(--text-muted)">
                      {fmtDate(a.updatedAt)}
                    </TableCell>
                    <TableCell>
                      {canManage ? (
                        <div className="flex flex-col gap-1 sm:flex-row sm:flex-wrap sm:gap-x-2">
                          <Link
                            href={`/admin/knowledge-base/articles/${a.id}/edit`}
                            className="text-sm font-medium text-(--color-primary) hover:underline"
                          >
                            Edit
                          </Link>
                          {a.status !== KbArticleStatus.PUBLISHED &&
                          a.status !== KbArticleStatus.ARCHIVED ? (
                            <button
                              type="button"
                              disabled={actionId === a.id}
                              onClick={() => void postAction("/publish", a.id, "Article published.")}
                              className="text-left text-sm font-medium text-(--text-primary) hover:underline disabled:opacity-50"
                            >
                              Publish
                            </button>
                          ) : null}
                          {a.status === KbArticleStatus.PUBLISHED ? (
                            <>
                              <button
                                type="button"
                                disabled={actionId === a.id}
                                onClick={() =>
                                  void postAction("/unpublish", a.id, "Article unpublished.")
                                }
                                className="text-left text-sm font-medium text-(--text-primary) hover:underline disabled:opacity-50"
                              >
                                Unpublish
                              </button>
                              <button
                                type="button"
                                disabled={actionId === a.id}
                                onClick={() =>
                                  void postAction("/reindex", a.id, "Search index updated.")
                                }
                                className="text-left text-sm font-medium text-(--text-primary) hover:underline disabled:opacity-50"
                              >
                                Reindex
                              </button>
                            </>
                          ) : null}
                          {a.status !== KbArticleStatus.ARCHIVED ? (
                            <button
                              type="button"
                              disabled={actionId === a.id}
                              onClick={() => void postAction("/archive", a.id, "Article archived.")}
                              className="text-left text-sm font-medium text-(--text-secondary) hover:underline disabled:opacity-50"
                            >
                              Archive
                            </button>
                          ) : null}
                          {a.status === KbArticleStatus.ARCHIVED ? (
                            <button
                              type="button"
                              disabled={actionId === a.id}
                              onClick={() => void deleteArticle(a.id)}
                              className="text-left text-sm font-medium text-(--color-danger) hover:underline disabled:opacity-50"
                            >
                              Delete
                            </button>
                          ) : null}
                        </div>
                      ) : (
                        <Link
                          href={`/admin/knowledge-base/articles/${a.id}/edit`}
                          className="text-sm font-medium text-(--color-primary) hover:underline"
                        >
                          View
                        </Link>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          {totalPages > 1 ? (
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-(--text-muted)">
                Page {page} of {totalPages}
              </p>
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  className="rounded-lg border border-(--border-subtle) px-3 py-1.5 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                >
                  Previous
                </button>
                <button
                  type="button"
                  disabled={page >= totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  className="rounded-lg border border-(--border-subtle) px-3 py-1.5 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            </div>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
