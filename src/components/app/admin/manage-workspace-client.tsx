"use client";

import { useCallback, useEffect, useState } from "react";
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

type Props = {
  tenantId: string;
  canResetPrimaryOwner2FA: boolean;
};

const ROLES = ["Owner", "Admin", "Finance", "Member"];

export function ManageWorkspaceClient({ tenantId, canResetPrimaryOwner2FA }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [workspace, setWorkspace] = useState<WorkspaceSummary | null>(null);
  const [workspaceLoading, setWorkspaceLoading] = useState(true);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberItem[]>([]);
  const [membersLoading, setMembersLoading] = useState(false);
  const [invites, setInvites] = useState<InviteItem[]>([]);
  const [invitesLoading, setInvitesLoading] = useState(false);
  const [tab, setTab] = useState("members");
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [revokeLoadingId, setRevokeLoadingId] = useState<string | null>(null);
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

  const fetchWorkspace = useCallback(async () => {
    setWorkspaceLoading(true);
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
    } finally {
      setWorkspaceLoading(false);
    }
  }, [tenantId, apiFetch]);

  const fetchMembers = useCallback(async () => {
    setMembersLoading(true);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/members?limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as { data: { items: MemberItem[] } };
      setMembers(data.data?.items ?? []);
    } finally {
      setMembersLoading(false);
    }
  }, [tenantId, apiFetch]);

  const fetchInvites = useCallback(async () => {
    setInvitesLoading(true);
    try {
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/invites?limit=50`);
      if (!res.ok) return;
      const data = (await res.json()) as { data: { items: InviteItem[] } };
      setInvites(data.data?.items ?? []);
    } finally {
      setInvitesLoading(false);
    }
  }, [tenantId, apiFetch]);

  useEffect(() => {
    fetchWorkspace();
  }, [fetchWorkspace]);

  useEffect(() => {
    if (tab === "members") fetchMembers();
  }, [tab, fetchMembers]);

  useEffect(() => {
    if (tab === "invites") fetchInvites();
  }, [tab, fetchInvites]);

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
      const res = await apiFetch(`/api/admin/workspaces/${tenantId}/members/${membershipId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
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
      const res = await apiFetch(
        `/api/admin/workspaces/${tenantId}/invites/${inviteId}/revoke`,
        { method: "POST" }
      );
      if (res.ok) {
        toast.addToast("success", "Invitation revoked");
        fetchInvites();
      }
    } finally {
      setRevokeLoadingId(null);
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
        }
      );
      if (res.ok) {
        toast.addToast("success", "Primary owner 2FA has been reset");
        setBreakGlassOpen(false);
        setBreakGlassConfirm("");
        fetchMembers();
      } else {
        const data = await res.json().catch(() => ({}));
        if (data?.details?.code === "STEP_UP_REQUIRED") {
          toast.addToast("error", "Recent authentication required. Please sign out and sign in again, then retry.");
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
    (m) =>
      !m.isPrimaryOwner &&
      (m.role === "Owner" || m.role === "Admin") &&
      m.status === "ACTIVE"
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
        <Link href="/admin/workspaces" className="hover:text-[var(--text-primary)]">
          Workspaces
        </Link>
        <span>/</span>
        <span className="text-[var(--text-primary)]">Manage</span>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50/80 p-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/30 dark:text-amber-200">
        You are in Platform Admin mode. Actions here affect this workspace.
      </div>

      {workspaceLoading ? (
        <Skeleton className="h-32 w-full" />
      ) : workspaceError || !workspace ? (
        <p className="text-sm text-red-600">{workspaceError ?? "Workspace not found"}</p>
      ) : (
        <div className="rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elev)] p-4">
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">{workspace.name}</h1>
          <dl className="mt-3 grid gap-1 text-sm">
            <div>
              <span className="text-[var(--text-muted)]">Slug: </span>
              <span>{workspace.slug}</span>
            </div>
            <div>
              <span className="text-[var(--text-muted)]">Status: </span>
              <span>{workspace.status}</span>
            </div>
            {workspace.timezone && (
              <div>
                <span className="text-[var(--text-muted)]">Timezone: </span>
                <span>{workspace.timezone}</span>
              </div>
            )}
            {workspace.currency && (
              <div>
                <span className="text-[var(--text-muted)]">Currency: </span>
                <span>{workspace.currency}</span>
              </div>
            )}
            {workspace.dateFormat && (
              <div>
                <span className="text-[var(--text-muted)]">Date format: </span>
                <span>{workspace.dateFormat}</span>
              </div>
            )}
            {workspace.description && (
              <div>
                <span className="text-[var(--text-muted)]">Description: </span>
                <span>{workspace.description}</span>
              </div>
            )}
          </dl>
        </div>
      )}

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="members">Members</TabsTrigger>
          <TabsTrigger value="invites">Invites</TabsTrigger>
        </TabsList>

        <TabsContent value="members" className="mt-4">
          {membersLoading ? (
            <Skeleton className="h-40 w-full" />
          ) : (
            <>
              {primaryOwner && (
                <div className="mb-4 rounded-lg border border-[var(--border-subtle)] bg-[var(--bg-surface-elev)] p-4">
                  <h3 className="text-sm font-semibold text-[var(--text-primary)]">
                    Transfer primary ownership
                  </h3>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    When the Primary Owner leaves, you can assign the Primary Owner role to an active
                    member who has the <strong>Owner</strong> or <strong>Admin</strong> role. That
                    member will become the new Primary Owner; the current one becomes Owner.
                  </p>
                  {eligibleForTransfer.length > 0 ? (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      <span className="text-sm text-[var(--text-muted)]">
                        Transfer to:
                      </span>
                      {eligibleForTransfer.map((m) => (
                        <button
                          key={m.membershipId}
                          type="button"
                          onClick={() => {
                            setTransferUserId(m.userId);
                            setTransferOpen(true);
                          }}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-subtle)] bg-[var(--bg-main)] px-3 text-sm font-medium hover:bg-[var(--bg-surface-elev)]"
                        >
                          {m.email ?? m.name ?? m.userId}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-[var(--text-muted)]">
                      No eligible members yet. Assign the <strong>Owner</strong> or{" "}
                      <strong>Admin</strong> role to the person who should become Primary Owner, then
                      use &quot;Transfer ownership&quot; on their row below or here once they appear.
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
                      <TableCell className="text-[var(--text-muted)]">{m.email ?? "—"}</TableCell>
                      <TableCell>
                        {m.isPrimaryOwner ? (
                          m.role
                        ) : (
                          <select
                            value={m.role}
                            onChange={(e) => handleRoleChange(m.membershipId, e.target.value)}
                            disabled={roleLoadingId === m.membershipId}
                            className="rounded border border-[var(--border-subtle)] bg-transparent px-2 py-1 text-sm"
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
                                m.status === "ACTIVE" ? "DISABLED" : "ACTIVE"
                              )
                            }
                            className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-subtle)] px-3 text-sm font-medium hover:bg-[var(--bg-surface-elev)] disabled:opacity-60"
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
                            className="mr-2 inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-subtle)] px-3 text-sm font-medium hover:bg-[var(--bg-surface-elev)]"
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
                            className="inline-flex h-8 items-center justify-center rounded-md border border-amber-400 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
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
                <p className="py-4 text-center text-[var(--text-muted)]">No members.</p>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="invites" className="mt-4">
          <div className="mb-3 flex justify-end">
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
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => (
                    <TableRow key={inv.id}>
                      <TableCell>{inv.email}</TableCell>
                      <TableCell>{inv.status}</TableCell>
                      <TableCell className="text-[var(--text-muted)]">
                        {new Date(inv.expiresAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                          {inv.status === "ACTIVE" && (
                          <button
                            type="button"
                            disabled={revokeLoadingId === inv.id}
                            onClick={() => handleRevokeInvite(inv.id)}
                            className="inline-flex h-8 items-center justify-center rounded-md border border-[var(--border-subtle)] px-3 text-sm font-medium hover:bg-[var(--bg-surface-elev)] disabled:opacity-60"
                          >
                            {revokeLoadingId === inv.id ? <Spinner size="sm" /> : "Revoke"}
                          </button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {invites.length === 0 && (
                <p className="py-4 text-center text-[var(--text-muted)]">No pending invites.</p>
              )}
            </>
          )}
        </TabsContent>
      </Tabs>

      {canResetPrimaryOwner2FA && primaryOwner && (
        <div className="rounded-lg border border-amber-300 bg-amber-50/50 p-4 dark:border-amber-700 dark:bg-amber-950/20">
          <h3 className="font-medium text-amber-900 dark:text-amber-200">Break-glass</h3>
          <p className="mt-1 text-sm text-amber-800 dark:text-amber-300">
            Reset 2FA for the Primary Owner ({primaryOwner.email ?? primaryOwner.userId}) so they can re-enroll on next login.
          </p>
          <button
            type="button"
            className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-amber-400 px-3 text-sm font-medium text-amber-700 hover:bg-amber-50 dark:text-amber-400 dark:hover:bg-amber-950/30"
            onClick={() => setBreakGlassOpen(true)}
          >
            Reset Primary Owner 2FA
          </button>
        </div>
      )}

      {breakGlassOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-[var(--bg-surface-elev)] p-4 shadow-lg">
            <h3 className="font-semibold text-[var(--text-primary)]">Reset Primary Owner 2FA</h3>
            <p className="mt-2 text-sm text-[var(--text-muted)]">
              Type <strong>RESET 2FA</strong> below to confirm. This will clear 2FA and log out the primary owner.
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
                onClick={() => { setBreakGlassOpen(false); setBreakGlassConfirm(""); }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-subtle)] px-4 text-sm font-medium hover:bg-[var(--bg-surface-elev)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={breakGlassConfirm !== "RESET 2FA" || breakGlassSubmitting}
                onClick={handleBreakGlassSubmit}
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {breakGlassSubmitting ? <Spinner size="sm" /> : "Confirm"}
              </button>
            </div>
          </div>
        </div>
      )}

      {inviteOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-[var(--bg-surface-elev)] p-4 shadow-lg">
            <h3 className="font-semibold text-[var(--text-primary)]">Invite member</h3>
            <Input
              type="email"
              className="mt-3"
              placeholder="Email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => { setInviteOpen(false); setInviteEmail(""); }}
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-subtle)] px-4 text-sm font-medium hover:bg-[var(--bg-surface-elev)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!inviteEmail.trim() || inviteSubmitting}
                onClick={handleInviteSubmit}
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
              >
                {inviteSubmitting ? <Spinner size="sm" /> : "Send invite"}
              </button>
            </div>
          </div>
        </div>
      )}

      {transferOpen && workspace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="w-full max-w-md rounded-lg bg-[var(--bg-surface-elev)] p-4 shadow-lg">
            <h3 className="font-semibold text-[var(--text-primary)]">Transfer primary ownership</h3>
            {transferUserId && (
              <p className="mt-2 text-sm text-[var(--text-muted)]">
                Transfer to: {members.find((m) => m.userId === transferUserId)?.email ?? transferUserId}
              </p>
            )}
            <p className="mt-2 text-sm text-[var(--text-muted)]">
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
                className="inline-flex h-9 items-center justify-center rounded-md border border-[var(--border-subtle)] px-4 text-sm font-medium hover:bg-[var(--bg-surface-elev)]"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={transferSlugConfirm !== workspace.slug || transferSubmitting}
                onClick={handleTransferSubmit}
                className="inline-flex h-9 items-center justify-center rounded-md bg-[var(--color-primary)] px-4 text-sm font-medium text-white hover:bg-[var(--color-primary-hover)] disabled:opacity-60"
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
