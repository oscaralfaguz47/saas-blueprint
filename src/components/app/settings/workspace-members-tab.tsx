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
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";
import { IconCopy, IconCheck, IconHelpCircle } from "@/components/ui/icons";

const ROLE_HELP = (
  <div className="text-xs space-y-1.5">
    <p><strong>Owner:</strong> Full control, billing, roles, workspace settings.</p>
    <p><strong>Admin:</strong> Manage workspace and members (except billing if restricted).</p>
    <p><strong>Finance:</strong> Finance-related workflows and approvals (per RBAC).</p>
    <p><strong>Member:</strong> Standard access, limited management rights.</p>
  </div>
);
import { useApiFetch } from "@/hooks/use-api-fetch";
import { InviteMemberModal } from "./invite-member-modal";

const PAGE_SIZE = 10;
const ROLES = [
  { value: "Owner", label: "Owner" },
  { value: "Admin", label: "Admin" },
  { value: "Finance", label: "Finance" },
  { value: "Member", label: "Member" },
];
const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "DISABLED", label: "Disabled" },
];

type Tenant = { id: string; name: string };

type MemberItem = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  status: string;
  joinedAt: string | null;
};

type Props = { tenant: Tenant; permissions: string[] };

type SortBy = "user" | "role" | "status" | "joined";
type SortDir = "asc" | "desc";

export function WorkspaceMembersTab({ tenant, permissions }: Props) {
  const permSet = new Set(permissions);
  const canManageRoles = permSet.has("tenant.roles.manage");
  const canInvite = permSet.has("tenant.users.invite");
  const canDisable = permSet.has("tenant.users.disable");
  const canManage = permSet.has("tenant.users.manage");
  const canChangeStatus = canManage || canDisable;
  const canEnable = canManage || canDisable;
  const apiFetch = useApiFetch();
  const [items, setItems] = useState<MemberItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [search, setSearch] = useState("");
  const [searchSent, setSearchSent] = useState("");
  const [roles, setRoles] = useState<string[]>([]);
  const [statuses, setStatuses] = useState<string[]>([]);
  const [sortBy, setSortBy] = useState<SortBy>("joined");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef(false);

  const fetchPage = useCallback(
    async (
      cursor: string | null,
      append: boolean,
      signal?: AbortSignal | null
    ) => {
      const params = new URLSearchParams();
      params.set("limit", String(PAGE_SIZE));
      if (cursor) params.set("cursor", cursor);
      params.set("sortBy", sortBy);
      params.set("sortDir", sortDir);
      if (searchSent.trim()) params.set("search", searchSent.trim());
      if (roles.length) params.set("roles", roles.join(","));
      if (statuses.length) params.set("statuses", statuses.join(","));
      try {
        const res = await apiFetch(
          `/api/settings/workspace/members?${params.toString()}`,
          { signal }
        );
        if (signal?.aborted) return null;
        const data = (await res.json()) as {
          data?: { items?: MemberItem[]; nextCursor?: string | null };
        };
        if (signal?.aborted) return null;
        const list = data.data?.items ?? [];
        const next = data.data?.nextCursor ?? null;
        if (append) {
          setItems((prev) => {
            const existingIds = new Set(prev.map((m) => m.userId));
            const newItems = list.filter((m) => !existingIds.has(m.userId));
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
    [apiFetch, sortBy, sortDir, searchSent, roles, statuses]
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
    const controller = new AbortController();
    loadInitial(controller.signal);
    return () => controller.abort();
  }, [sortBy, sortDir, searchSent, roles.join(","), statuses.join(",")]);

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

  const ownerCount = items.filter((u) => u.role === "Owner").length;

  const handleStatus = async (userId: string, status: "ACTIVE" | "DISABLED") => {
    setStatusLoadingId(userId);
    try {
      const res = await apiFetch(`/api/tenant/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((m) =>
            m.userId === userId ? { ...m, status } : m
          )
        );
      }
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleRole = async (userId: string, role: string) => {
    setRoleLoadingId(userId);
    try {
      const res = await apiFetch(`/api/tenant/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        setItems((prev) =>
          prev.map((m) => (m.userId === userId ? { ...m, role } : m))
        );
      }
    } finally {
      setRoleLoadingId(null);
    }
  };

  const copyEmail = async (userId: string, email: string | null) => {
    if (!email) return;
    try {
      await navigator.clipboard.writeText(email);
      setCopiedUserId(userId);
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    if (copiedUserId === null) return;
    const t = setTimeout(() => setCopiedUserId(null), 2000);
    return () => clearTimeout(t);
  }, [copiedUserId]);

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
  const SortHeader = ({
    col,
    label,
  }: {
    col: SortBy;
    label: string;
  }) => (
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
        <h2 className="text-sm font-medium text-(--text-primary)">Members</h2>
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
          <label className="block text-sm font-medium text-(--text-primary)">
            Search
          </label>
          <Input
            placeholder="Search by name or email"
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
          options={ROLES}
          selected={roles}
          onChange={setRoles}
          placeholder="Role"
          label="Role"
          disabled={loading}
          className="min-w-[140px]"
        />
        <DropdownMultiSelect
          options={STATUSES}
          selected={statuses}
          onChange={setStatuses}
          placeholder="Status"
          label="Status"
          disabled={loading}
          className="min-w-[140px]"
        />
        {(searchSent.trim() || roles.length > 0 || statuses.length > 0) && (
          <button
            type="button"
            onClick={() => {
              setSearch("");
              setSearchSent("");
              setRoles([]);
              setStatuses([]);
            }}
            className="self-end cursor-pointer text-sm font-medium text-(--color-primary) hover:underline disabled:cursor-not-allowed"
          >
            Clear filters
          </button>
        )}
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceName={tenant.name}
        onSuccess={loadInitial}
      />

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-(--border-subtle)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <TableRow key={i}>
                  <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-14" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                  <TableCell><Skeleton className="h-5 w-24 ml-auto" /></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : isEmpty ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-8 text-center">
          <p className="text-sm text-(--text-secondary)">
            No members found matching the filters.
          </p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="overflow-auto rounded-lg border border-(--border-subtle) max-h-[72vh] min-h-[320px]"
        >
          <Table>
            <TableHeader>
              <TableRow>
                <SortHeader col="user" label="User" />
                <TableHead>
                  <button
                    type="button"
                    onClick={() => handleSort("role")}
                    className="cursor-pointer font-medium text-(--text-primary) hover:underline"
                  >
                    Role
                    {sortBy === "role" ? (sortDir === "asc" ? " ↑" : " ↓") : ""}
                  </button>
                </TableHead>
                <SortHeader col="status" label="Status" />
                <SortHeader col="joined" label="Joined" />
                <TableHead className="text-right min-w-[120px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => {
                const isOwner = m.role === "Owner";
                const isLastOwner = isOwner && ownerCount <= 1;
                return (
                  <TableRow key={m.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        {m.image ? (
                          <img
                            src={m.image}
                            alt=""
                            className="h-8 w-8 shrink-0 rounded-full object-cover"
                          />
                        ) : (
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-(--bg-surface-elev) text-xs text-(--text-muted)">
                            {(m.name ?? m.email ?? "?").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-(--text-primary)">{m.name ?? "—"}</span>
                          <span className="block text-(--text-muted)">{m.email ?? "—"}</span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {roleLoadingId === m.userId ? (
                          <div
                            className="flex min-h-[44px] min-w-[100px] items-center justify-center rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1"
                            aria-busy="true"
                            aria-label="Updating role"
                          >
                            <Spinner size="sm" />
                          </div>
                        ) : canManageRoles && !isLastOwner ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleRole(m.userId, e.target.value)}
                            disabled={roleLoadingId === m.userId}
                            className="min-h-[44px] min-w-[100px] cursor-pointer rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
                          >
                            {ROLES.map((r) => (
                              <option key={r.value} value={r.value}>{r.label}</option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs font-medium text-(--text-primary)">
                            {m.role}
                          </span>
                        )}
                        <HoverCard>
                          <HoverCardTrigger>
                            <IconHelpCircle size={14} className="shrink-0 cursor-help text-(--text-muted)" aria-label="Role descriptions" />
                          </HoverCardTrigger>
                          <HoverCardContent side="bottom" className="text-xs">
                            {ROLE_HELP}
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    </TableCell>
                    <TableCell className="text-(--text-secondary)">{m.status}</TableCell>
                    <TableCell className="text-(--text-muted)">
                      {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        <button
                          type="button"
                          onClick={() => copyEmail(m.userId, m.email)}
                          className={`inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                            copiedUserId === m.userId
                              ? "bg-(--bg-surface-elev) text-(--text-primary)"
                              : "bg-(--bg-surface-elev) text-(--color-primary) hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                          }`}
                          aria-label={copiedUserId === m.userId ? "Copied" : "Copy email"}
                        >
                          {copiedUserId === m.userId ? (
                            <IconCheck size={14} />
                          ) : (
                            <IconCopy size={14} />
                          )}
                          <span className="hidden sm:inline">Copy Email</span>
                        </button>
                        {!isLastOwner && (canDisable || canManage) && m.status === "ACTIVE" && (
                          <button
                            type="button"
                            onClick={() => handleStatus(m.userId, "DISABLED")}
                            disabled={statusLoadingId === m.userId || isLastOwner}
                            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev) disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {statusLoadingId === m.userId ? <Spinner size="sm" /> : "Disable"}
                          </button>
                        )}
                        {!isLastOwner && canEnable && m.status !== "ACTIVE" && (
                          <button
                            type="button"
                            onClick={() => handleStatus(m.userId, "ACTIVE")}
                            disabled={statusLoadingId === m.userId}
                            className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded px-2 py-1 text-xs text-(--color-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60 disabled:cursor-not-allowed"
                          >
                            {statusLoadingId === m.userId ? <Spinner size="sm" /> : "Enable"}
                          </button>
                        )}
                        {isLastOwner && (
                          <span className="text-xs text-(--text-muted)" title="Cannot change or disable the last owner">
                            —
                          </span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
          {loadingMore && (
            <div className="flex justify-center py-4">
              <Skeleton className="h-6 w-32" />
            </div>
          )}
          {nextCursor && !loadingMore && (
            <div className="py-2 text-center text-sm text-(--text-muted)">
              Scroll for more
            </div>
          )}
        </div>
      )}
    </div>
  );
}
