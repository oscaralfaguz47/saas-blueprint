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
  <div className="space-y-1.5 text-xs">
    <p>
      <strong>Primary Owner:</strong> Full control, billing, roles; exactly one per workspace. Only
      they can manage Owners or transfer Primary Ownership.
    </p>
    <p>
      <strong>Owner:</strong> Same permissions as Primary Owner; cannot manage Owners or transfer
      Primary Ownership.
    </p>
    <p>
      <strong>Admin:</strong> Manage workspace and members (no billing).
    </p>
    <p>
      <strong>Finance:</strong> Finance-related workflows and approvals (per RBAC).
    </p>
    <p>
      <strong>Member:</strong> Standard access, limited management rights.
    </p>
  </div>
);
import { useSession } from "next-auth/react";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { StepUpModal } from "@/components/app/step-up-modal";
import { InviteMemberModal } from "./invite-member-modal";
import { TransferOwnershipModal } from "./transfer-ownership-modal";

const PAGE_SIZE = 10;
/** Roles that can be assigned via the UI (Primary Owner is only via transfer). */
const ROLES_ASSIGN = [
  { value: "Owner", label: "Owner" },
  { value: "Admin", label: "Admin" },
  { value: "Finance", label: "Finance" },
  { value: "Member", label: "Member" },
];
/** Role options for filter dropdown (includes Primary Owner). */
const ROLES_FILTER = [{ value: "Primary Owner", label: "Primary Owner" }, ...ROLES_ASSIGN];
const STATUSES = [
  { value: "ACTIVE", label: "Active" },
  { value: "DISABLED", label: "Disabled" },
];

type Tenant = { id: string; name: string; slug?: string };

type MemberItem = {
  userId: string;
  name: string | null;
  email: string | null;
  image: string | null;
  role: string;
  status: string;
  joinedAt: string | null;
  /** E6: 2FA status for security dropdown visibility and table column */
  mfaEnforced?: boolean;
  totpEnabled?: boolean;
};

type Props = {
  tenant: Tenant;
  permissions: string[];
  currentUserId: string;
  currentUserRole: string;
};

const ROLE_RANK: Record<string, number> = {
  "Primary Owner": 5,
  Owner: 4,
  Admin: 3,
  Finance: 2,
  Member: 1,
};

function roleRank(name: string): number {
  return ROLE_RANK[name] ?? 0;
}

/** Role options the current user can assign (only roles strictly below their rank). */
function getAssignableRoles(currentUserRole: string): { value: string; label: string }[] {
  const rank = roleRank(currentUserRole);
  return ROLES_ASSIGN.filter((r) => roleRank(r.value) < rank);
}

/** Whether the current user can show Enable/Disable for a member with the given role (hierarchy: only for roles below current user). */
function canShowStatusButtonsFor(currentUserRole: string, targetRole: string): boolean {
  return roleRank(currentUserRole) > roleRank(targetRole);
}

/** E6: Same authority as status — can manage member security (Force 2FA, Reset 2FA, etc.). */
function canShowSecurityActionsFor(currentUserRole: string, targetRole: string): boolean {
  if (targetRole === "Primary Owner" || targetRole === "Owner") {
    return currentUserRole === "Primary Owner";
  }
  return roleRank(currentUserRole) > roleRank(targetRole);
}

type SortBy = "user" | "role" | "status" | "joined";
type SortDir = "asc" | "desc";

type SecurityMenuAction =
  | "force-2fa"
  | "reset-2fa"
  | "disable-2fa"
  | "revoke-sessions"
  | "revoke-remembered-devices";

function getSecurityActionPath(userId: string, action: SecurityMenuAction): string {
  const base = "/api/settings/workspace/members";
  switch (action) {
    case "force-2fa":
      return `${base}/${userId}/security/force-2fa`;
    case "reset-2fa":
      return `${base}/${userId}/security/reset-2fa`;
    case "disable-2fa":
      return `${base}/${userId}/security/disable-2fa`;
    case "revoke-sessions":
      return `${base}/${userId}/security/revoke-sessions`;
    case "revoke-remembered-devices":
      return `${base}/${userId}/security/revoke-remembered-devices`;
    default: {
      const _exhaustive: never = action;
      return `${base}/${userId}/security/${String(_exhaustive)}`;
    }
  }
}

export function WorkspaceMembersTab({
  tenant,
  permissions,
  currentUserId,
  currentUserRole,
}: Props) {
  const permSet = new Set(permissions);
  const assignableRoles = getAssignableRoles(currentUserRole);
  const canManageRoles = permSet.has("tenant.roles.manage");
  const canInvite = permSet.has("tenant.users.invite");
  const canDisable = permSet.has("tenant.users.disable");
  const canManage = permSet.has("tenant.users.manage");
  const canChangeStatus = canManage || canDisable;
  const canEnable = canManage || canDisable;
  const { data: sessionData } = useSession();
  const hasTwoFactor = sessionData?.user?.totpEnabled ?? false;
  const apiFetch = useApiFetch();
  const toast = useToast();
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
  const [transferOpen, setTransferOpen] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);
  const [securityMenuUserId, setSecurityMenuUserId] = useState<string | null>(null);
  const [securityLoadingId, setSecurityLoadingId] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [stepUpAction, setStepUpAction] = useState<{
    userId: string;
    action: SecurityMenuAction;
  } | null>(null);
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
      if (roles.length) params.set("roles", roles.join(","));
      if (statuses.length) params.set("statuses", statuses.join(","));
      try {
        const res = await apiFetch(`/api/settings/workspace/members?${params.toString()}`, {
          signal,
        });
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
    [apiFetch, sortBy, sortDir, searchSent, roles, statuses],
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

  const ownerLevelCount = items.filter(
    (u) => u.role === "Primary Owner" || u.role === "Owner",
  ).length;

  const handleStatus = async (userId: string, status: "ACTIVE" | "DISABLED") => {
    setStatusLoadingId(userId);
    try {
      const res = await apiFetch(`/api/tenant/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        setItems((prev) => prev.map((m) => (m.userId === userId ? { ...m, status } : m)));
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
        setItems((prev) => prev.map((m) => (m.userId === userId ? { ...m, role } : m)));
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

  async function handleSecurityActionSuccess(res: Response, action: SecurityMenuAction) {
    setSecurityMenuUserId(null);
    let message: string;
    try {
      const data = (await res.clone().json()) as {
        data?: { alreadyEnforced?: boolean; skipped?: boolean; alreadyDisabled?: boolean };
      };
      if (action === "force-2fa" && data.data?.alreadyEnforced) {
        message = "Member is already required to use 2FA.";
      } else if (action === "force-2fa") {
        message =
          "2FA enforcement has been applied. The member must set up 2FA at next sign-in.";
      } else if (action === "reset-2fa" && data.data?.skipped) {
        message = "No 2FA to reset for this member.";
      } else if (action === "reset-2fa") {
        message =
          "2FA has been reset for this member. They will need to set it up again at next sign-in.";
      } else if (action === "disable-2fa" && data.data?.alreadyDisabled) {
        message = "2FA was already disabled for this member.";
      } else if (action === "disable-2fa") {
        message = "2FA has been disabled for this member.";
      } else if (action === "revoke-sessions") {
        message = "All sessions have been revoked for this member.";
      } else {
        message = "All remembered devices have been revoked for this member.";
      }
    } catch {
      message =
        action === "force-2fa"
          ? "2FA enforcement has been applied."
          : action === "reset-2fa"
            ? "2FA has been reset for this member."
            : action === "disable-2fa"
              ? "2FA has been disabled for this member."
              : action === "revoke-sessions"
                ? "All sessions have been revoked."
                : "All remembered devices have been revoked.";
    }
    toast.addToast("success", message);
    loadInitial();
  }

  async function handleStepUpSuccess() {
    setStepUpOpen(false);
    if (!stepUpAction) return;
    const { userId, action } = stepUpAction;
    setStepUpAction(null);
    setSecurityLoadingId(userId);
    try {
      const path = getSecurityActionPath(userId, action);
      const res = await apiFetch(path, { method: "PATCH", showToastOnError: false });
      if (res.ok) {
        await handleSecurityActionSuccess(res, action);
      } else {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        toast.addToast("error", errData.error?.message ?? "Something went wrong.");
      }
    } finally {
      setSecurityLoadingId(null);
    }
  }

  const runSecurityAction = async (userId: string, action: SecurityMenuAction) => {
    setSecurityLoadingId(userId);
    try {
      const path = getSecurityActionPath(userId, action);
      const res = await apiFetch(path, { method: "PATCH", showToastOnError: false });
      if (res.ok) {
        await handleSecurityActionSuccess(res, action);
      } else {
        const errData = (await res.json().catch(() => ({}))) as {
          error?: { details?: { code?: string }; message?: string };
        };
        const isStepUp = errData.error?.details?.code === "STEP_UP_REQUIRED";
        if (isStepUp) {
          setStepUpAction({ userId, action });
          setStepUpOpen(true);
        } else if (res.status === 403) {
          toast.addToast("error", "You don't have permission to perform this action.");
        } else if (res.status === 429) {
          toast.addToast("error", errData.error?.message ?? "Too many actions. Please wait.");
        } else {
          toast.addToast("error", errData.error?.message ?? "Something went wrong.");
        }
      }
    } finally {
      setSecurityLoadingId(null);
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
        <h2 className="text-sm font-medium text-(--text-primary)">Members</h2>
        <div className="flex flex-wrap items-center gap-2">
          {currentUserRole === "Primary Owner" && tenant.slug ? (
            <button
              type="button"
              onClick={() => setTransferOpen(true)}
              className="inline-flex h-10 min-h-[44px] cursor-pointer items-center justify-center rounded-lg border border-(--border-subtle) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
            >
              Transfer ownership
            </button>
          ) : null}
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
      </div>

      <div className="flex flex-wrap gap-2">
        <div className="min-w-[200px] flex-1">
          <label className="block text-sm font-medium text-(--text-primary)">Search</label>
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
          options={ROLES_FILTER}
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
        onSuccess={loadInitial}
      />
      {tenant.slug ? (
        <TransferOwnershipModal
          open={transferOpen}
          onClose={() => setTransferOpen(false)}
          workspaceName={tenant.name}
          workspaceSlug={tenant.slug}
          currentPrimaryOwnerName={
            items.find((m) => m.userId === currentUserId)?.name ??
            items.find((m) => m.userId === currentUserId)?.email ??
            "You"
          }
          eligibleMembers={items.filter(
            (m) =>
              m.userId !== currentUserId &&
              m.status === "ACTIVE" &&
              (m.role === "Owner" || m.role === "Admin"),
          )}
          onSuccess={loadInitial}
        />
      ) : null}

      {loading ? (
        <div className="overflow-hidden rounded-lg border border-(--border-subtle)">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>User</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>2FA</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <TableRow key={i}>
                  <TableCell>
                    <Skeleton className="h-5 w-32" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-14" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-16" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="h-5 w-20" />
                  </TableCell>
                  <TableCell>
                    <Skeleton className="ml-auto h-5 w-24" />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ) : isEmpty ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-8 text-center">
          <p className="text-sm text-(--text-secondary)">No members found matching the filters.</p>
        </div>
      ) : (
        <div
          ref={scrollRef}
          className="max-h-[72vh] min-h-[320px] overflow-auto rounded-lg border border-(--border-subtle)"
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
                <TableHead className="whitespace-nowrap">2FA</TableHead>
                <SortHeader col="joined" label="Joined" />
                <TableHead className="min-w-[120px] text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => {
                const isCurrentUser = m.userId === currentUserId;
                const isOwnerLevel = m.role === "Primary Owner" || m.role === "Owner";
                const isPrimaryOwner = m.role === "Primary Owner";
                const isLastOwnerLevel = isOwnerLevel && ownerLevelCount <= 1;
                const showRoleSelect =
                  canManageRoles &&
                  !isLastOwnerLevel &&
                  !isPrimaryOwner &&
                  !isCurrentUser &&
                  roleRank(currentUserRole) > roleRank(m.role) &&
                  assignableRoles.length > 0;
                const showStatusButtons =
                  canShowStatusButtonsFor(currentUserRole, m.role) && !isCurrentUser;
                const showSecurityActions =
                  canManage && canShowSecurityActionsFor(currentUserRole, m.role) && !isCurrentUser;
                const securityMenuOpen = securityMenuUserId === m.userId;
                const securityLoading = securityLoadingId === m.userId;
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
                        ) : showRoleSelect ? (
                          <select
                            value={m.role}
                            onChange={(e) => handleRole(m.userId, e.target.value)}
                            disabled={roleLoadingId === m.userId}
                            className="min-h-[44px] min-w-[100px] cursor-pointer rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
                          >
                            {assignableRoles.map((r) => (
                              <option key={r.value} value={r.value}>
                                {r.label}
                              </option>
                            ))}
                          </select>
                        ) : (
                          <span className="rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs font-medium text-(--text-primary)">
                            {m.role}
                          </span>
                        )}
                        <HoverCard>
                          <HoverCardTrigger>
                            <IconHelpCircle
                              size={14}
                              className="shrink-0 cursor-help text-(--text-muted)"
                              aria-label="Role descriptions"
                            />
                          </HoverCardTrigger>
                          <HoverCardContent side="bottom" className="text-xs">
                            {ROLE_HELP}
                          </HoverCardContent>
                        </HoverCard>
                      </div>
                    </TableCell>
                    <TableCell className="text-(--text-secondary)">{m.status}</TableCell>
                    <TableCell className="text-(--text-muted)">
                      {m.mfaEnforced ? "Enforced" : m.totpEnabled ? "Enabled" : "Off"}
                    </TableCell>
                    <TableCell className="text-(--text-muted)">
                      {m.joinedAt ? new Date(m.joinedAt).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-1">
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
                        {showStatusButtons &&
                          !isLastOwnerLevel &&
                          (canDisable || canManage) &&
                          m.status === "ACTIVE" && (
                            <button
                              type="button"
                              onClick={() => handleStatus(m.userId, "DISABLED")}
                              disabled={statusLoadingId === m.userId || isLastOwnerLevel}
                              className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {statusLoadingId === m.userId ? <Spinner size="sm" /> : "Disable"}
                            </button>
                          )}
                        {showStatusButtons &&
                          !isLastOwnerLevel &&
                          canEnable &&
                          m.status !== "ACTIVE" && (
                            <button
                              type="button"
                              onClick={() => handleStatus(m.userId, "ACTIVE")}
                              disabled={statusLoadingId === m.userId}
                              className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded px-2 py-1 text-xs text-(--color-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                            >
                              {statusLoadingId === m.userId ? <Spinner size="sm" /> : "Enable"}
                            </button>
                          )}
                        {showSecurityActions ? (
                          <div className="relative inline-block">
                            <button
                              type="button"
                              onClick={() =>
                                setSecurityMenuUserId((id) => (id === m.userId ? null : m.userId))
                              }
                              disabled={securityLoading}
                              className="inline-flex min-h-[44px] min-w-[44px] cursor-pointer items-center justify-center rounded bg-(--bg-surface-elev) px-2 py-1 text-xs text-(--text-primary) hover:bg-[color-mix(in_srgb,var(--border-subtle)_30%,transparent)] disabled:cursor-not-allowed disabled:opacity-60"
                              aria-expanded={securityMenuOpen}
                              aria-haspopup="true"
                            >
                              {securityLoading ? <Spinner size="sm" /> : "Security ▼"}
                            </button>
                            {securityMenuOpen ? (
                              <>
                                <div
                                  className="fixed inset-0 z-10"
                                  aria-hidden="true"
                                  onClick={() => setSecurityMenuUserId(null)}
                                />
                                <div
                                  className="absolute top-full right-0 z-20 mt-1 min-w-[180px] rounded-lg border border-(--border-subtle) bg-(--bg-surface) py-1 shadow-md"
                                  role="menu"
                                >
                                  {!m.mfaEnforced && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="block w-full px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                                      onClick={() => runSecurityAction(m.userId, "force-2fa")}
                                    >
                                      Force 2FA
                                    </button>
                                  )}
                                  {(m.totpEnabled || m.mfaEnforced) && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="block w-full px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                                      onClick={() => runSecurityAction(m.userId, "reset-2fa")}
                                    >
                                      Reset 2FA
                                    </button>
                                  )}
                                  {m.totpEnabled && (
                                    <button
                                      type="button"
                                      role="menuitem"
                                      className="block w-full px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                                      onClick={() => runSecurityAction(m.userId, "disable-2fa")}
                                    >
                                      Disable 2FA
                                    </button>
                                  )}
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                                    onClick={() => runSecurityAction(m.userId, "revoke-sessions")}
                                  >
                                    Revoke sessions
                                  </button>
                                  <button
                                    type="button"
                                    role="menuitem"
                                    className="block w-full px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                                    onClick={() =>
                                      runSecurityAction(m.userId, "revoke-remembered-devices")
                                    }
                                  >
                                    Revoke remembered devices
                                  </button>
                                </div>
                              </>
                            ) : null}
                          </div>
                        ) : null}
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
            <div className="py-2 text-center text-sm text-(--text-muted)">Scroll for more</div>
          )}
        </div>
      )}

      <StepUpModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setStepUpAction(null);
        }}
        onSuccess={() => void handleStepUpSuccess()}
        hasTwoFactor={hasTwoFactor}
        email={sessionData?.user?.email ?? null}
      />
    </div>
  );
}
