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
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

type WorkspaceSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  logoObjectKey: string | null;
  timezone: string | null;
  currency: string | null;
  dateFormat: string | null;
  description: string | null;
};

type MemberItem = {
  membershipId: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  joinedAt: string | null;
  isPrimaryOwner: boolean;
  mfaEnforced: boolean;
  totpEnabled: boolean;
};

type InviteItem = {
  id: string;
  email: string;
  status: string;
  invitedAt: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string | null } | null;
};

type WorkspaceSegment = "members" | "invites";

type Props = {
  tenantId: string;
  canResetPrimaryOwner2FA: boolean;
  /** When set, URL-driven nested segment (Platform Admin workspace manage). */
  segment?: WorkspaceSegment;
};

const ROLES = ["Owner", "Admin", "Finance", "Member"];

export function ManageWorkspaceClient({
  tenantId,
  canResetPrimaryOwner2FA,
  segment,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [tab, setTab] = useState("members");
  const showLegacyTabs = segment == null;
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [revokeLoadingId, setRevokeLoadingId] = useState<string | null>(null);
  const [resendLoadingId, setResendLoadingId] = useState<string | null>(null);
  const [reinviteLoadingId, setReinviteLoadingId] = useState<string | null>(null);
  const [breakGlassOpen, setBreakGlassOpen] = useState(false);
  const [breakGlassConfirm, setBreakGlassConfirm] = useState("");
  const [breakGlassSubmitting, setBreakGlassSubmitting] = useState(false);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteSubmitting, setInviteSubmitting] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferUserId, setTransferUserId] = useState("");
  const [transferSlugConfirm, setTransferSlugConfirm] = useState("");
  const [transferSubmitting, setTransferSubmitting] = useState(false);
  const [membersSearch, setMembersSearch] = useState("");
  const [membersSearchSent, setMembersSearchSent] = useState("");
  const [invitesSearch, setInvitesSearch] = useState("");
  const [invitesSearchSent, setInvitesSearchSent] = useState("");

  const fetchWorkspace = useCallback(async () => {
    setWorkspaceError(null);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}`);
      if (!res.ok) {
        setWorkspaceError("Failed to load workspace");
        return;
      }
      const data = (await res.json()) as { data: WorkspaceSummary };
      setWorkspace(data.data);
    } catch {
      setWorkspaceError("Failed to load workspace");
    }
  }, [tenantId, apiFetch]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (membersSearchSent.trim()) params.set("search", membersSearchSent.trim());
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/members?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { data: { items: MemberItem[] } };
      setMembers(data.data?.items ?? []);
    } finally {
      setMembersLoading(false);
    }
  }, [tenantId, apiFetch, membersSearchSent]);

  const fetchInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (invitesSearchSent.trim()) params.set("search", invitesSearchSent.trim());
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/invites?${params.toString()}`);
      if (!res.ok) return;
      const data = (await res.json()) as { data: { items: InviteItem[] } };
      setInvites(data.data?.items ?? []);
    } finally {
      setInvitesLoading(false);
    }
  }, [tenantId, apiFetch, invitesSearchSent]);

  const fetchWorkspaceRef = useRef(fetchWorkspace);
  const fetchMembersRef = useRef(fetchMembers);
  const fetchInvitesRef = useRef(fetchInvites);
  fetchWorkspaceRef.current = fetchWorkspace;
  fetchMembersRef.current = fetchMembers;
  fetchInvitesRef.current = fetchInvites;

  useEffect(() => {
    fetchWorkspaceRef.current();
  }, [tenantId]);

  useEffect(() => {
    const t = setTimeout(() => setMembersSearchSent(membersSearch), 300);
    return () => clearTimeout(t);
  }, [membersSearch]);

  useEffect(() => {
    const t = setTimeout(() => setInvitesSearchSent(invitesSearch), 300);
    return () => clearTimeout(t);
  }, [invitesSearch]);

  const showMembers =
    (!showLegacyTabs && segment === "members") || (showLegacyTabs && tab === "members");
  const showInvites =
    (!showLegacyTabs && segment === "invites") || (showLegacyTabs && tab === "invites");
  /** Radix tabs only define "members" | "invites". */
  const tabValue =
    segment === "invites" ? "invites" : segment === "members" ? "members" : showLegacyTabs ? tab : "members";
  const showMemberInviteTabs =
    segment == null || segment === "members" || segment === "invites";

  useEffect(() => {
    if (showMembers) fetchMembersRef.current();
  }, [tenantId, showMembers, membersSearchSent]);

  useEffect(() => {
    if (showInvites) fetchInvitesRef.current();
  }, [tenantId, showInvites, invitesSearchSent]);

  const handleRoleChange = async (membershipId: string, role: string) => {
    setRoleLoadingId(membershipId);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/members/${membershipId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      if (res.ok) {
        toast.addToast("success", "Role updated");
        fetchMembers();
      }
    } finally {
      setRoleLoadingId(null);
    }
  };

  const handleStatusChange = async (membershipId: string, status: "ACTIVE" | "DISABLED") => {
    setStatusLoadingId(membershipId);
    try {
      const res = await apiFetch(
        `/api/admin/workspaces/${tenantId}/members/${membershipId}/status`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ status }),
        },
      );
      if (res.ok) {
        toast.addToast("success", status === "ACTIVE" ? "Member enabled" : "Member disabled");
        fetchMembers();
      }
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleRevokeInvite = async (inviteId: string) => {
    setRevokeLoadingId(inviteId);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/invites/${inviteId}/revoke`, {
        method: "POST",
      });
      if (res.ok) {
        toast.addToast("success", "Invitation revoked");
        fetchInvites();
      }
    } finally {
      setRevokeLoadingId(null);
    }
  };

  const handleResendInvite = async (inviteId: string) => {
    setResendLoadingId(inviteId);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/invites/${inviteId}/resend`, {
        method: "POST",
      });
      if (res.ok) {
        toast.addToast("success", "Invitation resent");
        fetchInvites();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.addToast("error", data?.message ?? "Failed to resend");
      }
    } finally {
      setResendLoadingId(null);
    }
  };

  const handleReinvite = async (inviteId: string) => {
    setReinviteLoadingId(inviteId);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/invites/${inviteId}/reinvite`, {
        method: "POST",
      });
      if (res.ok) {
        toast.addToast("success", "Re-invitation sent");
        fetchInvites();
      } else {
        const data = await res.json().catch(() => ({}));
        toast.addToast("error", data?.message ?? "Failed to re-invite");
      }
    } finally {
      setReinviteLoadingId(null);
    }
  };

  const handleBreakGlassSubmit = async () => {
    if (breakGlassConfirm !== "RESET 2FA") {
      toast.addToast("error", 'Type exactly "RESET 2FA" to confirm');
      return;
    }
    setBreakGlassSubmitting(true);
    try {
      const res = await apiFetch(
        `/api/admin/workspaces/${tenantId}/break-glass/reset-primary-owner-2fa`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ confirm: "RESET 2FA" }),
        },
      );
      if (res.ok) {
        toast.addToast("success", "Primary owner 2FA has been reset");
        setBreakGlassOpen(false);
        setBreakGlassConfirm("");
        fetchMembers();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data?.details?.code === "STEP_UP_REQUIRED") {
          toast.addToast(
            "error",
            "Recent authentication required. Please sign out and sign in again, then retry.",
          );
        } else {
          toast.addToast("error", data?.message ?? "Failed to reset 2FA");
        }
      }
    } finally {
      setBreakGlassSubmitting(false);
    }
  };

  const handleInviteSubmit = async () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setInviteSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/invites`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, sendEmail: true }),
      });
      if (res.ok) {
        toast.addToast("success", "Invitation sent");
        setInviteOpen(false);
        setInviteEmail("");
        fetchInvites();
      }
    } finally {
      setInviteSubmitting(false);
    }
  };

  const handleTransferSubmit = async () => {
    if (!transferUserId || !workspace) return;
    if (transferSlugConfirm !== workspace.slug) {
      toast.addToast("error", "Workspace slug does not match");
      return;
    }
    setTransferSubmitting(true);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/transfer-primary-owner`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPrimaryOwnerUserId: transferUserId,
          workspaceSlugConfirm: transferSlugConfirm,
        }),
      });
      if (res.ok) {
        toast.addToast("success", "Primary ownership transferred");
        setTransferOpen(false);
        setTransferUserId("");
        setTransferSlugConfirm("");
        fetchMembers();
      }
    } finally {
      setTransferSubmitting(false);
    }
  };

  const primaryOwner = members.find((m) => m.isPrimaryOwner);
  const eligibleForTransfer = members.filter(
    (m) => !m.isPrimaryOwner && (m.role === "Owner" || m.role === "Admin") && m.status === "ACTIVE",
  );

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) p-3 text-sm text-(--color-warning)">
        You are in Platform Admin mode. Actions here affect this workspace.
      </div>

      {workspaceError ? (
        <p className="text-sm text-(--color-danger)">{workspaceError}</p>
      ) : null}

      {showMemberInviteTabs && (
      <Tabs value={tabValue} onValueChange={showLegacyTabs ? setTab : () => {}}>
        {showLegacyTabs ? (
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>
        ) : null}

        <TabsContent value="members" className="mt-4">
          <h2 className="mb-4 text-lg font-semibold text-(--text-primary)">Workspace members</h2>
          <div className="mb-4">
            <Input
              placeholder="Search by name or email"
              value={membersSearch}
              onChange={(e) => setMembersSearch(e.target.value)}
              className="max-w-xs"
            />
          </div>
          {membersLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              {primaryOwner && (
                <div className="mb-4 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
                  <h3 className="text-sm font-semibold text-(--text-primary)">
                    Transfer primary ownership
                  </h3>
                  <p className="mt-1 text-sm text-(--text-muted)">
                    When the Primary Owner leaves, you can assign the Primary Owner role to an
                    active member who has the <strong>Owner</strong> or <strong>Admin</strong> role.
                    That member will become the new Primary Owner; the current one becomes Owner.
                  </p>
                  {eligibleForTransfer.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-(--text-muted)">Transfer to:</span>
                      {eligibleForTransfer.map((m) => (
                        <button
                          key={m.membershipId}
                          type="button"
                          onClick={() => {
                            setTransferUserId(m.userId);
                            setTransferOpen(true);
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-(--border-subtle) bg-(--bg-main) px-3 text-sm font-medium hover:bg-(--bg-surface-elev)"
                        >
                          {m.email ?? m.name ?? m.userId}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-(--text-muted)">
                      No eligible members yet. Assign the <strong>Owner</strong> or{" "}
                      <strong>Admin</strong> role to the person who should become Primary Owner,
                      then use &quot;Transfer ownership&quot; on their row below or here once they
                      appear.
                    </p>
                  )}
                </div>
              )}
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>2FA</TableHead>
                    <TableHead className="w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.map((m) => (
                    <TableRow key={m.membershipId}>
                      <TableCell>
                        {m.name ?? "—"} {m.isPrimaryOwner && "(Primary Owner)"}
                      </TableCell>
                      <TableCell className="text-(--text-muted)">{m.email ?? "—"}</TableCell>
                      <TableCell>
                        {m.isPrimaryOwner ? (
                          m.role
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.membershipId, e.target.value)}
                            disabled={roleLoadingId === m.membershipId}
                            className="rounded border border-(--border-subtle) bg-transparent px-2 py-1 text-sm"
                          >
                            {ROLES.map((r) => (
                              <option key={r} value={r}>
                                {r}
                              </option>
                            ))}
                          </select>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.isPrimaryOwner ? (
                          m.status
                        ) : (
                          <button
                            type="button"
                            disabled={statusLoadingId === m.membershipId}
                            onClick={() =>
                              handleStatusChange(
                                m.membershipId,
                                m.status === "ACTIVE" ? "DISABLED" : "ACTIVE",
                              )
                            }
                            className="inline-flex h-8 items-center justify-center rounded-md border border-(--border-subtle) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-60"
                          >
                            {statusLoadingId === m.membershipId ? (
                              <Spinner size="sm" />
                            ) : m.status === "ACTIVE" ? (
                              "Disable"
                            ) : (
                              "Enable"
                            )}
                          </button>
                        )}
                      </TableCell>
                      <TableCell>
                        {m.totpEnabled ? "Yes" : "No"}
                        {m.mfaEnforced && !m.totpEnabled && " (enforced)"}
                      </TableCell>
                      <TableCell>
                        {!m.isPrimaryOwner && (m.role === "Owner" || m.role === "Admin") && (
                          <button
                            type="button"
                            className="mr-2 inline-flex h-8 items-center justify-center rounded-md border border-(--border-subtle) px-3 text-sm font-medium hover:bg-(--bg-surface-elev)"
                            onClick={() => {
                              setTransferUserId(m.userId);
                              setTransferOpen(true);
                            }}
                          >
                            Transfer ownership
                          </button>
                        )}
                        {m.isPrimaryOwner && canResetPrimaryOwner2FA && (
                          <button
                            type="button"
                            className="inline-flex h-8 items-center justify-center rounded-md border border-(--color-warning-soft) px-3 text-sm font-medium text-(--color-warning) hover:bg-(--color-warning-soft)"
                            onClick={() => setBreakGlassOpen(true)}
                          >
                            Reset 2FA
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {members.length === 0 && (
                <p className="py-4 text-center text-(--text-muted)">No members.</p>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          <h2 className="mb-4 text-lg font-semibold text-(--text-primary)">Workspace invites</h2>
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <Input
              id="admin-invites-search"
              name="invites-search"
              autoComplete="off"
              placeholder="Search by email"
              value={invitesSearch}
              onChange={(e) => setInvitesSearch(e.target.value)}
              className="max-w-xs"
            />
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setInviteOpen(true)}
              className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)]"
            >
              Invite
            </button>
          </div>
          {invitesLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[200px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell>{inv.status}</TableCell>
                      <TableCell className="text-(--text-muted)">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-2">
                          {inv.status === "ACTIVE" && (
                            <>
                              <button
                                type="button"
                                disabled={resendLoadingId === inv.id}
                                onClick={() => handleResendInvite(inv.id)}
                                className="inline-flex h-8 items-center justify-center rounded-md border border-(--border-subtle) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-60"
                              >
                                {resendLoadingId === inv.id ? <Spinner size="sm" /> : "Resend"}
                              </button>
                              <button
                                type="button"
                                disabled={revokeLoadingId === inv.id}
                                onClick={() => handleRevokeInvite(inv.id)}
                                className="inline-flex h-8 items-center justify-center rounded-md border border-(--border-subtle) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-60"
                              >
                                {revokeLoadingId === inv.id ? <Spinner size="sm" /> : "Revoke"}
                              </button>
                            </>
                          )}
                          {(inv.status === "REVOKED" ||
                            inv.status === "EXPIRED" ||
                            inv.status === "REJECTED") && (
                            <button
                              type="button"
                              disabled={reinviteLoadingId === inv.id}
                              onClick={() => handleReinvite(inv.id)}
                              className="inline-flex h-8 items-center justify-center rounded-md border border-(--border-subtle) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-60"
                            >
                              {reinviteLoadingId === inv.id ? <Spinner size="sm" /> : "Re-invite"}
                            </button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invites.length === 0 && (
                <p className="py-4 text-center text-(--text-muted)">No pending invites.</p>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>
      )}

      {canResetPrimaryOwner2FA && primaryOwner && (
        <div className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) p-4">
          <h3 className="font-medium text-(--color-warning)">Break-glass</h3>
          <p className="mt-1 text-sm text-(--color-warning)">
            Reset 2FA for the Primary Owner ({primaryOwner.email ?? primaryOwner.userId}) so they
            can re-enroll on next login.
          </p>
          <button
            type="button"
            className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-(--color-warning-soft) px-3 text-sm font-medium text-(--color-warning) hover:bg-(--color-warning-soft)"
            onClick={() => setBreakGlassOpen(true)}
          >
            Reset Primary Owner 2FA
          </button>
        </div>
      )}

      {breakGlassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-(--bg-surface-elev) p-4 shadow-lg">
            <h3 className="font-semibold text-(--text-primary)">Reset Primary Owner 2FA</h3>
            <p className="mt-2 text-sm text-(--text-muted)">
              Type <strong>RESET 2FA</strong> below to confirm. This will clear 2FA and log out the
              primary owner.
            </p>
            <Input
              className="mt-3"
              value={breakGlassConfirm}
              onChange={(e) => setBreakGlassConfirm(e.target.value)}
              placeholder="RESET 2FA"
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setBreakGlassOpen(false);
                  setBreakGlassConfirm("");
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-(--border-subtle) px-4 text-sm font-medium hover:bg-(--bg-surface-elev)"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={breakGlassConfirm !== "RESET 2FA" || breakGlassSubmitting}
                onClick={handleBreakGlassSubmit}
                className="inline-flex h-9 items-center justify-center rounded-md bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
              >
                {breakGlassSubmitting ? <Spinner size="sm" /> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          key="invite-modal"
        >
          <div className="w-full max-w-md rounded-lg bg-(--bg-surface-elev) p-4 shadow-lg">
            <h3 className="font-semibold text-(--text-primary)">Invite member</h3>
            <Input
              id="admin-invite-modal-email"
              name="invite-email"
              type="email"
              autoComplete="off"
              className="mt-3"
              placeholder="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setInviteOpen(false);
                  setInviteEmail("");
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-(--border-subtle) px-4 text-sm font-medium hover:bg-(--bg-surface-elev)"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!inviteEmail.trim() || inviteSubmitting}
                onClick={handleInviteSubmit}
                className="inline-flex h-9 items-center justify-center rounded-md bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
              >
                {inviteSubmitting ? <Spinner size="sm" /> : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferOpen && workspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-(--bg-surface-elev) p-4 shadow-lg">
            <h3 className="font-semibold text-(--text-primary)">Transfer primary ownership</h3>
            {transferUserId && (
              <p className="mt-2 text-sm text-(--text-muted)">
                Transfer to:{" "}
                {members.find((m) => m.userId === transferUserId)?.email ?? transferUserId}
              </p>
            )}
            <p className="mt-2 text-sm text-(--text-muted)">
              Type the workspace slug <strong>{workspace.slug}</strong> to confirm.
            </p>
            <Input
              className="mt-3"
              placeholder={`Type "${workspace.slug}"`}
              value={transferSlugConfirm}
              onChange={(e) => setTransferSlugConfirm(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setTransferOpen(false);
                  setTransferUserId("");
                  setTransferSlugConfirm("");
                }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-(--border-subtle) px-4 text-sm font-medium hover:bg-(--bg-surface-elev)"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={transferSlugConfirm !== workspace.slug || transferSubmitting}
                onClick={handleTransferSubmit}
                className="inline-flex h-9 items-center justify-center rounded-md bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
              >
                {transferSubmitting ? <Spinner size="sm" /> : "Transfer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
