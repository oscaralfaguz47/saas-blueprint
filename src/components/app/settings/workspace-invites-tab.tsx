"use client";

import { useCallback, useEffect, useRef, useState } from "react";
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
import { DropdownMultiSelect } from "@/components/ui/dropdown-multi-select";
import type {
  BillingAccessLevel,
  FinancialAccessScope,
  FinanceResponsibility,
  WorkspaceRole,
} from "@prisma/client";
import { useApiFetch } from "@/hooks/use-api-fetch";
import {
  BILLING_ACCESS_LABELS,
  FINANCE_RESPONSIBILITY_LABELS,
  FINANCIAL_ACCESS_LABELS,
  WORKSPACE_ROLE_LABELS,
} from "@/lib/4-axis-labels";
import { Badge } from "@/components/ui/badge";
import { InviteMemberModal } from "./invite-member-modal";

const PAGE_SIZE = 10;
const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "REJECTED", label: "Rejected" },
  { value: "EXPIRED", label: "Expired" },
  { value: "REVOKED", label: "Revoked" },
  { value: "ACCEPTED", label: "Accepted" },
];

type Tenant = { id: string; name: string };

type InvitationItem = {
  id: string;
  email: string;
  status: "ACTIVE" | "EXPIRED" | "REVOKED" | "ACCEPTED" | "REJECTED";
  invitedAt: string;
  expiresAt: string;
  role: string;
  workspaceRole?: WorkspaceRole | null;
  financialAccess?: FinancialAccessScope | null;
  financeResponsibility?: FinanceResponsibility | null;
  billingAccess?: BillingAccessLevel | null;
  invitedBy: { name: string | null; email: string | null } | null;
};

type Props = { tenant: Tenant; permissions: string[]; currentUserRole: string };

type ActionType = "resend" | "revoke" | "reinvite";
type SortBy = "email" | "status" | "invitedAt" | "expiresAt";
type SortDir = "asc" | "desc";

export function WorkspaceInvitesTab({ tenant, permissions, currentUserRole }: Props) {
  const permSet = new Set(permissions);
  const canInvite = permSet.has("tenant.users.invite");
  const canManageInvites = permSet.has("tenant.users.manage");
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<InvitationItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [searchSent, setSearchSent] = useState("");
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("invitedAt");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<{ id: string; action: ActionType } | null>(
    null,
  );
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    async (cursor: string | null, append: boolean, signal?: AbortSignal | null) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (cursor) params.set("cursor", cursor);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (searchSent.trim()) params.set("search", searchSent.trim());
      if (statuses.length) params.set("statuses", statuses.join(","));
      try {
        const res = await apiFetch(`/api/settings/workspace/invitations?${params.toString()}`, {
          signal,
        });
        if (signal?.aborted) return null;
        const data = (await res.json()) as {
          data?: { items?: InvitationItem[]; nextCursor?: string | null };
        };
        if (signal?.aborted) return null;
        const list = data.data?.items ?? [];
        const next = data.data?.nextCursor ?? null;
        if (append) {
          setItems((prev) => {
            const existingIds = new Set(prev.map((i) => i.id));
            const newItems = list.filter((item) => !existingIds.has(item.id));
            return [...prev, ...newItems];
          });
        } else {
          loadingMoreRef.current = false;
          setItems(list);
        }
        setNextCursor(next);
        return next;
      } catch (err) {
        if (err instanceof Error && err.name === "AbortError") return null;
        throw err;
      }
    },
    [apiFetch, sortBy, sortDir, searchSent, statuses],
  );

  const loadInitial = useCallback(
    (signal?: AbortSignal | null) => {
      setLoading(true);
      fetchPage(null, false, signal).finally(() => {
        if (!signal?.aborted) setLoading(false);
      });
    },
    [fetchPage],
  );

  useEffect(() => {
    const controller = new AbortController();
    loadInitial(controller.signal);
    return () => controller.abort();
  }, [sortBy, sortDir, searchSent, statuses.join(",")]);

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
      if (scrollHeight - scrollTop - clientHeight < 200) loadMore();
    };
    el.addEventListener("scroll", onScroll);
    return () => el.removeEventListener("scroll", onScroll);
  }, [loadMore]);

  const runAction = async (id: string, action: ActionType) => {
    setActionLoading({ id, action });
    try {
      const res = await apiFetch(`/api/tenant/invitations/${id}/${action}`, { method: "POST" });
      if (res.ok) {
        if (action === "revoke") {
          setItems((prev) =>
            prev.map((inv) => (inv.id === id ? { ...inv, status: "REVOKED" } : inv)),
          );
        } else if (action === "reinvite") {
          const newExpiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
          setItems((prev) =>
            prev.map((inv) =>
              inv.id === id ? { ...inv, status: "ACTIVE", expiresAt: newExpiresAt } : inv,
            ),
          );
        }
      }
    } finally {
      setActionLoading(null);
    }
  };

  const isRowLoading = (id: string) => actionLoading?.id === id;
  const isActionLoading = (id: string, action: ActionType) =>
    actionLoading?.id === id && actionLoading?.action === action;

  const onSearchKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") setSearchSent(search);
  };
  const onSearchBlur = () => setSearchSent(search);

  const handleSort = (col: SortBy) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("desc");
    }
  };
  const SortHeader = ({ col, label }: { col: SortBy; label: string }) => (
    <TableHead>
      <button
        type="button"
        onClick={() => handleSort(col)}
        className="cursor-pointer text-left font-medium text-(--text-primary) hover:underline"
      >
        {label}
        {sortBy === col ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
      </button>
    </TableHead>
  );

  const isEmpty = !loading && !items.length;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-(--text-primary)">Invitations</h2>
        {canInvite ? (
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="inline-flex h-10 min-h-[44px] cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Invite people
          </button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="block text-sm font-medium text-(--text-primary)">Search</label>
          <Input
            placeholder="Search by email"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={onSearchKeyDown}
            onBlur={onSearchBlur}
            disabled={loading}
            maxLength={200}
            title="Max 200 characters"
            className="mt-1.5"
          />
        </div>
        <DropdownMultiSelect
          options={STATUSES}
          selected={statuses}
          onChange={setStatuses}
          placeholder="Status"
          label="Status"
          disabled={loading}
          className="min-w-[140px]"
        />
        {(searchSent.trim() || statuses.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchSent("");
              setStatuses([]);
            }}
            className="cursor-pointer self-end text-sm font-medium text-(--color-primary) hover:underline disabled:cursor-not-allowed"
          >
            Clear filters
          </button>
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceName={tenant.name}
        currentUserRole={currentUserRole}
        onSuccess={loadInitial}
      />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-(--border-subtle)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Email</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-(--text-muted)">
                  Role
                </TableHead>
                <TableHead>Invited by</TableHead>
                <TableHead>Invited at</TableHead>
                <TableHead>Expires at</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-40" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-24" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-28" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-5 w-20" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : isEmpty ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-8 text-center">
          <p className="text-sm text-(--text-secondary)">No invitations found.</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="max-h-[72vh] min-h-[320px] overflow-auto rounded-lg border border-(--border-subtle)"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader col="email" label="Email" />
                <SortHeader col="status" label="Status" />
                <TableHead className="px-3 py-3 text-left text-xs font-medium uppercase tracking-wide text-(--text-muted)">
                  Role
                </TableHead>
                <TableHead>Invited by</TableHead>
                <SortHeader col="invitedAt" label="Invited at" />
                <SortHeader col="expiresAt" label="Expires at" />
                <TableHead className="min-w-[180px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((inv) => (
                <TableRow key={inv.id}>
                  <TableCell className="text-(--text-primary)">{inv.email}</TableCell>
                  <TableCell>
                    <span className="inline-flex rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs font-medium text-(--text-primary)">
                      {inv.status}
                    </span>
                  </TableCell>
                  <TableCell className="px-3 py-3 text-sm text-(--text-secondary)">
                    <div className="flex flex-col gap-1">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{
                            backgroundColor:
                              inv.role === "Owner"
                                ? "#7c3aed"
                                : inv.role === "Admin"
                                  ? "#2563eb"
                                  : inv.role === "Finance"
                                    ? "#16a34a"
                                    : "#71717a",
                          }}
                        />
                        {inv.role}
                      </span>
                      {inv.workspaceRole != null ||
                      inv.financialAccess != null ||
                      inv.financeResponsibility != null ||
                      inv.billingAccess != null ? (
                        <div className="flex flex-wrap gap-1">
                          {inv.workspaceRole != null ? (
                            <Badge variant="secondary">
                              {WORKSPACE_ROLE_LABELS[inv.workspaceRole]}
                            </Badge>
                          ) : null}
                          {inv.financialAccess != null ? (
                            <Badge variant="secondary">
                              {FINANCIAL_ACCESS_LABELS[inv.financialAccess]}
                            </Badge>
                          ) : null}
                          {inv.financeResponsibility != null ? (
                            <Badge variant="secondary">
                              {FINANCE_RESPONSIBILITY_LABELS[inv.financeResponsibility]}
                            </Badge>
                          ) : null}
                          {inv.billingAccess != null ? (
                            <Badge variant="secondary">
                              {BILLING_ACCESS_LABELS[inv.billingAccess]}
                            </Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </TableCell>
                  <TableCell className="text-(--text-muted)">
                    {inv.invitedBy?.name ?? inv.invitedBy?.email ?? "—"}
                  </TableCell>
                  <TableCell className="text-(--text-muted)">
                    {new Date(inv.invitedAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-(--text-muted)">
                    {new Date(inv.expiresAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex flex-nowrap items-center justify-end gap-1">
                      {canManageInvites && inv.status === "ACTIVE" && (
                        <>
                          <button
                            type="button"
                            onClick={() => runAction(inv.id, "resend")}
                            disabled={isRowLoading(inv.id)}
                            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded px-2 py-1 text-xs text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActionLoading(inv.id, "resend") ? <Spinner size="sm" /> : "Resend"}
                          </button>
                          <button
                            type="button"
                            onClick={() => runAction(inv.id, "revoke")}
                            disabled={isRowLoading(inv.id)}
                            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActionLoading(inv.id, "revoke") ? <Spinner size="sm" /> : "Revoke"}
                          </button>
                        </>
                      )}
                      {canManageInvites &&
                        (inv.status === "EXPIRED" ||
                          inv.status === "REVOKED" ||
                          inv.status === "REJECTED") && (
                          <button
                            type="button"
                            onClick={() => runAction(inv.id, "reinvite")}
                            disabled={isRowLoading(inv.id)}
                            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded px-2 py-1 text-xs text-(--color-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                          >
                            {isActionLoading(inv.id, "reinvite") ? (
                              <Spinner size="sm" />
                            ) : (
                              "Re-invite"
                            )}
                          </button>
                        )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Skeleton className="h-6 w-32" />
            </div>
          )}
          {nextCursor && !loadingMore && (
            <div className="py-2 text-center text-sm text-(--text-muted)">Scroll for more</div>
          )}
        </div>
      )}
    </div>
  );
}
