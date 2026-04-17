"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useApiFetch } from "@/hooks/use-api-fetch";

type VendorRoleName = "PlatformAdmin" | "SupportAdmin" | "BillingOps" | "ReadOnlySupport";

type VendorUser = {
  userId: string;
  name: string | null;
  email: string | null;
  totpEnabled: boolean;
  isBootstrapAdmin: boolean;
  roles: string[];
};

type PendingInvitation = {
  id: string;
  email: string;
  roleName: string;
  createdAt: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string | null };
};

const SUPER_ADMIN_ROLES: VendorRoleName[] = [
  "PlatformAdmin",
  "SupportAdmin",
  "BillingOps",
  "ReadOnlySupport",
];

const REGULAR_ADMIN_ROLES: VendorRoleName[] = ["SupportAdmin", "BillingOps", "ReadOnlySupport"];

export function AdminVendorUsersClient({
  isBootstrapAdmin,
  currentUserId,
}: {
  isBootstrapAdmin: boolean;
  currentUserId: string;
}) {
  const apiFetch = useApiFetch();
  const [loadingUsers, setLoadingUsers] = useState(true);
  const [loadingInvites, setLoadingInvites] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [changingRoleUserId, setChangingRoleUserId] = useState<string | null>(null);
  const [revokingSessionsUserId, setRevokingSessionsUserId] = useState<string | null>(null);
  const [resetting2faUserId, setResetting2faUserId] = useState<string | null>(null);
  const [users, setUsers] = useState<VendorUser[]>([]);
  const [invitations, setInvitations] = useState<PendingInvitation[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [invitesError, setInvitesError] = useState<string | null>(null);
  const [emailInput, setEmailInput] = useState("");
  const [selectedRole, setSelectedRole] = useState<VendorRoleName>(
    isBootstrapAdmin ? "PlatformAdmin" : "SupportAdmin"
  );
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const allowedRoles = isBootstrapAdmin ? SUPER_ADMIN_ROLES : REGULAR_ADMIN_ROLES;

  const loadVendorUsers = useCallback(async () => {
    setLoadingUsers(true);
    setError(null);
    try {
      const res = await apiFetch("/api/admin/vendor-users");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "Failed to load vendor users.");
        setUsers([]);
        return;
      }
      const data = (await res.json()) as { data?: { users?: VendorUser[] } };
      setUsers(data.data?.users ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load vendor users.");
      setUsers([]);
    } finally {
      setLoadingUsers(false);
    }
  }, [apiFetch]);

  const loadInvitations = useCallback(async () => {
    setLoadingInvites(true);
    setInvitesError(null);
    try {
      const res = await apiFetch("/api/admin/vendor-invitations");
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setInvitesError(data.error?.message ?? "Failed to load pending invitations.");
        setInvitations([]);
        return;
      }
      const data = (await res.json()) as { data?: { invitations?: PendingInvitation[] } };
      setInvitations(data.data?.invitations ?? []);
    } catch (e) {
      setInvitesError(e instanceof Error ? e.message : "Failed to load pending invitations.");
      setInvitations([]);
    } finally {
      setLoadingInvites(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    void loadVendorUsers();
  }, [loadVendorUsers]);

  useEffect(() => {
    void loadInvitations();
  }, [loadInvitations]);

  const sortedUsers = useMemo(
    () =>
      [...users].sort((a, b) =>
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", undefined, {
          sensitivity: "base",
        })
      ),
    [users]
  );

  const canRemoveUser = useCallback(
    (user: VendorUser) => {
      if (user.isBootstrapAdmin) return false;
      if (user.userId === currentUserId) return false;
      if (!isBootstrapAdmin && user.roles.includes("PlatformAdmin")) return false;
      return true;
    },
    [currentUserId, isBootstrapAdmin]
  );

  const canManageUserSecurity = useCallback(
    (user: VendorUser) => {
      // Cannot act on yourself
      if (user.userId === currentUserId) return false;
      // Cannot act on bootstrap admin
      if (user.isBootstrapAdmin) return false;
      // Any PlatformAdmin can reset 2FA / revoke sessions for non-bootstrap users
      // (the API enforces the same rules server-side)
      return true;
    },
    [currentUserId]
  );

  const canRevokeInvitation = useCallback(
    (inv: PendingInvitation) => {
      if (!isBootstrapAdmin && inv.roleName === "PlatformAdmin") return false;
      return true;
    },
    [isBootstrapAdmin]
  );

  const handleChangeRole = async (userId: string, newRole: VendorRoleName) => {
    setChangingRoleUserId(userId);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/vendor-users/${userId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roleName: newRole }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "Failed to change role.");
      }
      await loadVendorUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to change role.");
    } finally {
      setChangingRoleUserId(null);
    }
  };

  const handleRevokeSessions = async (userId: string) => {
    setRevokingSessionsUserId(userId);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/vendor-users/${userId}/revoke-sessions`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "Failed to revoke sessions.");
      } else {
        setSuccessMessage("Sessions revoked. User will be signed out on next request.");
      }
      await loadVendorUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to revoke sessions.");
    } finally {
      setRevokingSessionsUserId(null);
    }
  };

  const handleReset2fa = async (userId: string) => {
    setResetting2faUserId(userId);
    setError(null);
    try {
      const res = await apiFetch(`/api/admin/vendor-users/${userId}/reset-2fa`, {
        method: "POST",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setError(data.error?.message ?? "Failed to reset 2FA.");
      } else {
        setSuccessMessage("2FA reset. User must re-enroll before accessing Platform Admin.");
      }
      await loadVendorUsers();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to reset 2FA.");
    } finally {
      setResetting2faUserId(null);
    }
  };

  const handleInviteOrAssign = async () => {
    const email = emailInput.trim().toLowerCase();
    if (!email) {
      setError("Enter an email address.");
      return;
    }

    setSubmitting(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const res = await apiFetch("/api/admin/vendor-users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, roleName: selectedRole }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { method?: string };
        error?: { message?: string };
      };

      if (!res.ok) {
        setError(json.error?.message ?? "Request failed.");
        await loadVendorUsers();
        await loadInvitations();
        return;
      }

      if (json.data?.method === "assigned") {
        setSuccessMessage("Role assigned and user notified.");
      } else if (json.data?.method === "invited") {
        setSuccessMessage("Invitation sent. The user will be granted access after signing in.");
      }

      setEmailInput("");
      await loadVendorUsers();
      await loadInvitations();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed.");
      await loadVendorUsers();
      await loadInvitations();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRemoveUser = async (userId: string) => {
    setSubmitting(true);
    setError(null);

    const previous = users;
    setUsers((current) => current.filter((user) => user.userId !== userId));

    try {
      const res = await apiFetch(`/api/admin/vendor-users/${userId}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setUsers(previous);
        setError(data.error?.message ?? "Failed to remove vendor user.");
        await loadVendorUsers();
        return;
      }
      await loadVendorUsers();
    } catch (e) {
      setUsers(previous);
      setError(e instanceof Error ? e.message : "Failed to remove vendor user.");
      await loadVendorUsers();
    } finally {
      setSubmitting(false);
    }
  };

  const handleRevokeInvitation = async (invitationId: string) => {
    setSubmitting(true);
    setInvitesError(null);

    const previous = invitations;
    setInvitations((current) => current.filter((i) => i.id !== invitationId));

    try {
      const res = await apiFetch("/api/admin/vendor-invitations", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invitationId }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setInvitations(previous);
        setInvitesError(data.error?.message ?? "Failed to revoke invitation.");
        await loadInvitations();
        return;
      }
      await loadInvitations();
    } catch (e) {
      setInvitations(previous);
      setInvitesError(e instanceof Error ? e.message : "Failed to revoke invitation.");
      await loadInvitations();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="rounded-md border border-(--border-subtle) bg-(--bg-surface) p-4">
        <p className="text-sm font-medium text-(--text-primary)">Invite admin user</p>
        <p className="mt-1 text-xs text-(--text-muted)">
          Enter the email of the person you want to grant platform admin access. If they already have
          an account the role is assigned immediately — otherwise they receive an invitation to sign
          up.
        </p>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <div>
            <Input
              type="email"
              placeholder="user@example.com"
              value={emailInput}
              onChange={(e) => setEmailInput(e.target.value)}
              autoComplete="off"
            />
          </div>
          <div>
            <select
              value={selectedRole}
              onChange={(e) => setSelectedRole(e.target.value as VendorRoleName)}
              className="w-full rounded-md border border-(--border-subtle) bg-(--bg-main) px-3 py-2 text-sm text-(--text-primary)"
            >
              {allowedRoles.map((role) => (
                <option key={role} value={role}>
                  {role}
                </option>
              ))}
            </select>
          </div>
          <div>
            <button
              type="button"
              disabled={submitting}
              onClick={() => void handleInviteOrAssign()}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-primary px-3 text-sm font-medium text-white hover:bg-primary-hover disabled:opacity-50"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  Working…
                </span>
              ) : (
                "Invite / assign"
              )}
            </button>
          </div>
        </div>
      </div>

      {successMessage && (
        <div className="rounded-md border border-success-soft bg-success-soft p-3 text-sm text-success">
          {successMessage}
        </div>
      )}

      {error && (
        <div className="rounded-md border border-danger-soft bg-danger-soft p-3 text-sm text-(--color-danger)">
          {error}
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold text-(--text-primary)">Active vendor users</h2>
        <div className="mt-3 rounded-md border border-(--border-subtle)">
          {loadingUsers ? (
            <div className="flex items-center justify-center p-8">
              <Spinner />
            </div>
          ) : users.length === 0 ? (
            <div className="p-8 text-center text-sm text-(--text-muted)">No vendor users found.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role(s)</TableHead>
                  <TableHead>2FA Status</TableHead>
                  <TableHead className="w-[120px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sortedUsers.map((user) => (
                  <TableRow key={user.userId}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span>{user.name ?? "—"}</span>
                        {user.isBootstrapAdmin && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-amber-400/50 bg-amber-400/10 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="10"
                              height="10"
                              viewBox="0 0 24 24"
                              fill="currentColor"
                              stroke="none"
                            >
                              <path d="M2 20h20v2H2v-2zm2-3 4-9 4 5 4-7 4 11H4z" />
                            </svg>
                            Super Admin
                          </span>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{user.email ?? "—"}</TableCell>
                    <TableCell>
                      {canRemoveUser(user) ? (
                        <select
                          value={user.roles[0] ?? ""}
                          disabled={changingRoleUserId === user.userId || submitting}
                          onChange={(e) =>
                            void handleChangeRole(user.userId, e.target.value as VendorRoleName)
                          }
                          className="rounded-md border border-(--border-subtle) bg-(--bg-main) px-2 py-1 text-sm text-(--text-primary) disabled:opacity-50"
                        >
                          {allowedRoles.map((role) => (
                            <option key={role} value={role}>
                              {role}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <div className="flex flex-wrap gap-1">
                          {user.roles.map((role) => (
                            <Badge key={`${user.userId}-${role}`} variant="secondary">
                              {role}
                            </Badge>
                          ))}
                        </div>
                      )}
                      {changingRoleUserId === user.userId && (
                        <span className="ml-2 text-xs text-(--text-muted)">Saving…</span>
                      )}
                    </TableCell>
                    <TableCell>
                      {user.totpEnabled ? (
                        <Badge variant="success">Enabled</Badge>
                      ) : (
                        <Badge variant="warning">Not enabled</Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {canRemoveUser(user) && (
                          <button
                            type="button"
                            title="Remove vendor access"
                            disabled={submitting || changingRoleUserId === user.userId}
                            onClick={() => void handleRemoveUser(user.userId)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-danger-soft text-(--color-danger) hover:bg-danger-soft disabled:opacity-50 transition-colors"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              width="14"
                              height="14"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            >
                              <path d="M3 6h18" />
                              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                            </svg>
                          </button>
                        )}
                        {canManageUserSecurity(user) && (
                          <button
                            type="button"
                            title="Revoke all active sessions"
                            disabled={revokingSessionsUserId === user.userId}
                            onClick={() => void handleRevokeSessions(user.userId)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--border-subtle) text-(--text-secondary) hover:bg-(--bg-surface-elev) hover:text-(--text-primary) disabled:opacity-50 transition-colors"
                          >
                            {revokingSessionsUserId === user.userId ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="animate-spin"
                              >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
                                <path d="M7 11V7a5 5 0 0 1 9.9-1" />
                              </svg>
                            )}
                          </button>
                        )}
                        {canManageUserSecurity(user) && (
                          <button
                            type="button"
                            title="Reset 2FA — user must re-enroll"
                            disabled={resetting2faUserId === user.userId}
                            onClick={() => void handleReset2fa(user.userId)}
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-(--border-subtle) text-(--text-secondary) hover:bg-(--bg-surface-elev) hover:text-(--text-primary) disabled:opacity-50 transition-colors"
                          >
                            {resetting2faUserId === user.userId ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="animate-spin"
                              >
                                <path d="M21 12a9 9 0 1 1-6.219-8.56" />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                              >
                                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" />
                                <path d="m9 12 2 2 4-4" />
                              </svg>
                            )}
                          </button>
                        )}
                        {!canRemoveUser(user) && !canManageUserSecurity(user) && (
                          <span className="text-xs text-(--text-muted)">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>

      <div>
        <h2 className="text-lg font-semibold text-(--text-primary)">Pending invitations</h2>
        {invitesError && (
          <div className="mt-2 rounded-md border border-danger-soft bg-danger-soft p-3 text-sm text-(--color-danger)">
            {invitesError}
          </div>
        )}
        <div className="mt-3 rounded-md border border-(--border-subtle)">
          {loadingInvites ? (
            <div className="flex items-center justify-center p-8">
              <Spinner />
            </div>
          ) : invitations.length === 0 ? (
            <div className="p-8 text-center text-sm text-(--text-muted)">No pending invitations.</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Invited at</TableHead>
                  <TableHead>Expires at</TableHead>
                  <TableHead>Invited by</TableHead>
                  <TableHead className="w-[100px]">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {invitations.map((inv) => (
                  <TableRow key={inv.id}>
                    <TableCell>{inv.email}</TableCell>
                    <TableCell>
                      <Badge variant="secondary">{inv.roleName}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-(--text-muted)">
                      {new Date(inv.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-(--text-muted)">
                      {new Date(inv.expiresAt).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-sm text-(--text-secondary)">
                      {inv.invitedBy.name ?? inv.invitedBy.email ?? "—"}
                    </TableCell>
                    <TableCell>
                      {canRevokeInvitation(inv) ? (
                        <button
                          type="button"
                          disabled={submitting}
                          onClick={() => void handleRevokeInvitation(inv.id)}
                          className="inline-flex h-8 items-center justify-center rounded-md border border-danger-soft px-3 text-sm font-medium text-(--color-danger) hover:bg-danger-soft disabled:opacity-50"
                        >
                          Revoke
                        </button>
                      ) : (
                        <span className="text-xs text-(--text-muted)">—</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </div>
      </div>
    </div>
  );
}
