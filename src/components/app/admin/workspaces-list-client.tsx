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

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  scale: "Scale",
  enterprise: "Enterprise",
};

function formatShortDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function StatusBadge({ status }: { status: string }) {
  const s = status.toUpperCase();
  const styles =
    s === "ACTIVE"
      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400"
      : s === "SUSPENDED"
        ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
        : s === "CLOSED"
          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
          : s === "DRAFT"
            ? "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"
            : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400";

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {status}
    </span>
  );
}

function PlanBadge({ planCode, label }: { planCode: string; label: string }) {
  const styles =
    planCode === "scale" || planCode === "enterprise"
      ? "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-400"
      : planCode === "pro"
        ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400"
        : planCode === "starter"
          ? "bg-sky-100 text-sky-800 dark:bg-sky-900/30 dark:text-sky-400"
          : "bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400"; // free

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles}`}>
      {label}
    </span>
  );
}

function PlanCell({
  planCode,
  pendingPlanCode,
  pendingChangeType,
  entitlementEffectiveUntil,
}: {
  planCode: string;
  pendingPlanCode: string | null;
  pendingChangeType: string | null;
  entitlementEffectiveUntil: string | null;
}) {
  const label = PLAN_LABELS[planCode] ?? planCode;
  const pendingLabel = pendingPlanCode ? (PLAN_LABELS[pendingPlanCode] ?? pendingPlanCode) : null;
  const effectiveDate = entitlementEffectiveUntil
    ? formatShortDate(entitlementEffectiveUntil)
    : null;

  return (
    <div className="space-y-0.5">
      <PlanBadge planCode={planCode} label={label} />
      {pendingChangeType === "cancel_to_free_end_of_period" && effectiveDate && (
        <p className="text-xs text-(--text-muted)">→ Free on {effectiveDate}</p>
      )}
      {pendingChangeType === "downgrade_end_of_period" && pendingLabel && effectiveDate && (
        <p className="text-xs text-(--text-muted)">
          → {pendingLabel} on {effectiveDate}
        </p>
      )}
    </div>
  );
}

type WorkspaceItem = {
  id: string;
  name: string;
  slug: string;
  status: string;
  createdAt: string;
  planCode: string;
  pendingPlanCode: string | null;
  pendingChangeType: string | null;
  entitlementEffectiveUntil: string | null;
};

type UserOption = { id: string; name?: string; email?: string };

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "DRAFT", label: "Draft" },
  { value: "SUSPENDED", label: "Suspended" },
  { value: "CLOSED", label: "Closed" },
];

const PLAN_OPTIONS = [
  { value: "", label: "All plans" },
  { value: "free", label: "Free" },
  { value: "starter", label: "Starter" },
  { value: "pro", label: "Pro" },
  { value: "scale", label: "Scale" },
];

const PAGE_SIZE = 25;
const MAX_USER_FILTER = 10;

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
  const [plan, setPlan] = useState("");
  const [selectedUsers, setSelectedUsers] = useState<UserOption[]>([]);
  const [userSearch, setUserSearch] = useState("");
  const [userSearchResults, setUserSearchResults] = useState<UserOption[]>([]);
  const [userSearchOpen, setUserSearchOpen] = useState(false);
  const [userSearchLoading, setUserSearchLoading] = useState(false);
  const userSearchRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const userIds = selectedUsers.map((u) => u.id);
  const userIdsKey = userIds.slice().sort().join(",");

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean, signal?: AbortSignal | null) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (cursor) params.set("cursor", cursor);
      if (qSent.trim()) params.set("q", qSent.trim());
      if (status) params.set("status", status);
      if (plan) params.set("plan", plan);
      if (userIds.length) params.set("userIds", userIds.join(","));
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
    [apiFetch, qSent, status, plan, userIdsKey],
  );

  const searchUsers = useCallback(
    async (term: string) => {
      if (term.trim().length < 2) {
        setUserSearchResults([]);
        return;
      }
      setUserSearchLoading(true);
      try {
        const res = await apiFetch(
          `/api/admin/users/search?q=${encodeURIComponent(term.trim())}&limit=10`,
          { showToastOnError: false },
        );
        if (!res.ok) {
          setUserSearchResults([]);
          return;
        }
        const data = (await res.json()) as { data?: { items?: UserOption[] } };
        setUserSearchResults(data.data?.items ?? []);
      } catch {
        setUserSearchResults([]);
      } finally {
        setUserSearchLoading(false);
      }
    },
    [apiFetch],
  );

  useEffect(() => {
    const t = setTimeout(() => {
      if (userSearch.trim().length >= 2) searchUsers(userSearch);
      else setUserSearchResults([]);
    }, 300);
    return () => clearTimeout(t);
  }, [userSearch, searchUsers]);

  useEffect(() => {
    if (!userSearchOpen) return;
    function onPointerDown(e: PointerEvent) {
      if (userSearchRef.current?.contains(e.target as Node)) return;
      setUserSearchOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [userSearchOpen]);

  const loadInitial = useCallback(
    (signal?: AbortSignal | null) => {
      setLoading(true);
      return fetchPage(null, false, signal).finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
    },
    [fetchPage],
  );

  useEffect(() => {
    const t = setTimeout(() => setQSent(q), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    const controller = new AbortController();
    loadInitial(controller.signal)?.catch((err: unknown) => {
      if (err instanceof Error && err.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Failed to load workspaces");
    });
    return () => controller.abort();
  }, [qSent, status, plan, userIdsKey, loadInitial]);

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
      <h1 className="text-xl font-semibold text-(--text-primary)">Workspaces</h1>

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
          className="rounded-md border border-(--border-subtle) bg-(--bg-main) px-3 py-2 text-sm text-(--text-primary)"
        >
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value || "all"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={plan}
          onChange={(e) => setPlan(e.target.value)}
          className="rounded-md border border-(--border-subtle) bg-(--bg-main) px-3 py-2 text-sm text-(--text-primary)"
        >
          {PLAN_OPTIONS.map((o) => (
            <option key={o.value || "all-plans"} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <div ref={userSearchRef} className="relative w-full max-w-[280px] min-w-[200px]">
          <Input
            placeholder="Filter by member (type to search)"
            value={userSearch}
            onChange={(e) => {
              setUserSearch(e.target.value);
              setUserSearchOpen(true);
            }}
            onFocus={() => setUserSearchOpen(true)}
          />
          {selectedUsers.length > 0 && (
            <div className="mt-1.5 flex max-h-20 flex-wrap gap-1.5 overflow-y-auto rounded border border-(--border-subtle) bg-(--bg-main) p-1.5">
              {selectedUsers.map((u) => {
                const label = u.email ?? u.name ?? u.id;
                return (
                  <span
                    key={u.id}
                    className="inline-flex max-w-full shrink-0 items-center gap-1 rounded-md bg-(--bg-surface-elev) px-2 py-0.5 text-xs text-(--text-primary)"
                  >
                    <span className="min-w-0 truncate" title={label}>
                      {label}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSelectedUsers((prev) => prev.filter((x) => x.id !== u.id))}
                      className="shrink-0 hover:text-(--color-danger)"
                      aria-label={`Remove ${label}`}
                    >
                      ×
                    </button>
                  </span>
                );
              })}
              {selectedUsers.length >= MAX_USER_FILTER && (
                <span className="self-center text-xs text-(--text-muted)">
                  (max {MAX_USER_FILTER})
                </span>
              )}
            </div>
          )}
          {userSearchOpen && (
            <div className="absolute z-10 mt-1 max-h-52 w-full overflow-auto rounded-md border border-(--border-subtle) bg-(--bg-surface) py-1 shadow-lg">
              {userSearchLoading ? (
                <div className="flex items-center justify-center py-4">
                  <Spinner size="sm" />
                </div>
              ) : userSearch.trim().length < 2 ? (
                <p className="px-3 py-2 text-sm text-(--text-muted)">
                  Type at least 2 characters to search users
                </p>
              ) : userSearchResults.length === 0 ? (
                <p className="px-3 py-2 text-sm text-(--text-muted)">No users found</p>
              ) : (
                userSearchResults.map((u) => {
                  const alreadySelected = selectedUsers.some((s) => s.id === u.id);
                  const atMax = selectedUsers.length >= MAX_USER_FILTER;
                  const label = u.email ?? u.name ?? u.id;
                  return (
                    <button
                      key={u.id}
                      type="button"
                      disabled={alreadySelected || atMax}
                      onClick={() => {
                        if (alreadySelected || atMax) return;
                        setSelectedUsers((prev) => [...prev, u]);
                        setUserSearch("");
                        setUserSearchResults([]);
                      }}
                      className="w-full px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {label}
                      {alreadySelected ? " (added)" : ""}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </div>
      </div>

      <div
        ref={scrollRef}
        className="max-h-[60vh] overflow-auto rounded-md border border-(--border-subtle)"
      >
        {error && <div className="p-4 text-sm text-(--color-danger)">{error}</div>}
        {loading ? (
          <div className="space-y-2 p-4">
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
            <Skeleton className="h-10 w-full" />
          </div>
        ) : items.length === 0 ? (
          <div className="p-8 text-center text-(--text-muted)">No workspaces found.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Slug</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Current Plan</TableHead>
                <TableHead className="w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((t) => (
                <TableRow key={t.id}>
                  <TableCell className="font-medium">{t.name}</TableCell>
                  <TableCell className="text-(--text-muted)">{t.slug}</TableCell>
                  <TableCell>
                    <StatusBadge status={t.status} />
                  </TableCell>
                  <TableCell className="text-(--text-muted)">
                    {new Date(t.createdAt).toLocaleDateString()}
                  </TableCell>
                  <TableCell>
                    <PlanCell
                      planCode={t.planCode}
                      pendingPlanCode={t.pendingPlanCode}
                      pendingChangeType={t.pendingChangeType}
                      entitlementEffectiveUntil={t.entitlementEffectiveUntil}
                    />
                  </TableCell>
                  <TableCell>
                    <Link
                      href={`/admin/workspaces/${t.id}`}
                      className="inline-flex h-8 items-center justify-center rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-3 text-sm font-medium hover:bg-(--bg-surface-elev)/90"
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
