"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";

type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
};

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CLOSED", label: "Closed" },
];

const PAGE_SIZE = 25;

export function WorkspacesListClient() {
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<WorkspaceItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [qSent, setQSent] = useState("");
  const [status, setStatus] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean, signal?: AbortSignal | null) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (cursor) params.set("cursor", cursor);
      if (qSent.trim()) params.set("q", qSent.trim());
      if (status) params.set("status", status);
      const res = await apiFetch(`/api/admin/workspaces?${params.toString()}`, {
        signal,
        showToastOnError: !append,
      });
      if (signal?.aborted) return null;
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data?.message ?? "Failed to load workspaces");
        return null;
      }
      const data = (await res.json()) as {
        data?: { items?: WorkspaceItem[]; nextCursor?: string | null };
      };
      if (signal?.aborted) return null;
      const list = data.data?.items ?? [];
      const next = data.data?.nextCursor ?? null;
      if (append) {
        setItems((prev) => {
          const ids = new Set(prev.map((t) => t.id));
          return [...prev, ...list.filter((t) => !ids.has(t.id))];
        });
      } else {
        setItems(list);
      }
      setNextCursor(next);
      setError(null);
      return next;
    },
    [apiFetch, qSent, status]
  );

  const loadInitial = useCallback(
    (signal?: AbortSignal | null) => {
      setLoading(true);
      fetchPage(null, false, signal).finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
    },
    [fetchPage]
  );

  useEffect(() => {
    const t = setTimeout(() => setQSent(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    loadInitial(controller.signal);
    return () => controller.abort();
  }, [qSent, status, loadInitial]);

  const loadMore = useCallback(() => {
    if (!nextCursor || loadingMoreRef.current) return;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    fetchPage(nextCursor, true).finally(() => {
      loadingMoreRef.current = false;
      setLoadingMore(false);
    });
  }, [nextCursor, fetchPage]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = el;
      if (scrollHeight - scrollTop - clientHeight < 300) loadMore();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadMore]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold text-[var(--text-primary)]">Workspaces</h1>

      <div className="flex flex-wrap items-center gap-3">
        <Input
          placeholder="Search by name or slug"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-xs"
        />
        <select
          value={status}
          onChange={(e) => setStatus(e.target.value)}
          className="rounded-md border border-[var(--border-subtle)] bg-[var(--bg-main)] px-3 py-2 text-sm text-[var(--text-primary)]"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div ref={scrollRef} className="max-h-[60vh] overflow-auto rounded-md border border-[var(--border-subtle)]">
        {error && (
          <div className="p-4 text-sm text-red-600 dark:text-red-400">
            {error}
          </div>
        )}
        {loading ? (
          <div className="p-4 space-y-2">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-[var(--text-muted)]">
            No workspaces found.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-[var(--text-muted)]">{t.slug}</TableCell>
                  <TableCell>{t.status}</TableCell>
                  <TableCell className="text-[var(--text-muted)]">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/workspaces/${t.id}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-surface-elev)] px-3 text-sm font-medium hover:bg-[var(--bg-surface-elev)]/90"
                    >
                      Manage
                    </Link>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
        {loadingMore && (
          <div className="flex justify-center py-4">
            <Spinner size="sm" />
          </div>
        )}
      </div>
    </div>
  );
}
