"use client";

import { useEffect, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { IconCopy, IconCheck } from "@/components/ui/icons";
import { useToast } from "@/components/ui/toast";
import { InviteMemberModal } from "./invite-member-modal";

type Tenant = { id: string; name: string };

type Member = {
  membership: { id: string; status: string; joinedAt: string | null };
  user: { id: string; email: string | null; name: string | null; image: string | null };
  roles: string[];
};

type Props = { tenant: Tenant };

function getErrorMessage(res: Response, data: { error?: string; message?: string }): string {
  if (data.message && typeof data.message === "string") return data.message;
  if (data.error === "FORBIDDEN") return "You don't have permission to do this.";
  if (data.error === "UNAUTHENTICATED") return "Please sign in again.";
  if (res.status === 403) return "You don't have permission to do this.";
  if (res.status === 401) return "Please sign in again.";
  return "Something went wrong. Please try again.";
}

export function WorkspaceMembersTab({ tenant }: Props) {
  const toast = useToast();
  const [users, setUsers] = useState<Member[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [statusLoadingId, setStatusLoadingId] = useState<string | null>(null);
  const [roleLoadingId, setRoleLoadingId] = useState<string | null>(null);
  const [copiedUserId, setCopiedUserId] = useState<string | null>(null);

  const refetch = () => {
    setLoading(true);
    fetch("/api/tenant/users")
      .then((r) => r.json())
      .then((j: { data?: { users?: Member[] } }) => {
        setUsers((j.data?.users ?? []) as Member[]);
      })
      .catch(() => {
        setUsers([]);
        toast.addToast("error", "Failed to load members.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
  }, []);

  const ownerCount = users?.filter((u) => u.roles.includes("Owner")).length ?? 0;

  const handleStatus = async (userId: string, status: "ACTIVE" | "DISABLED") => {
    setStatusLoadingId(userId);
    try {
      const res = await fetch(`/api/tenant/users/${userId}/status`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (res.ok) {
        setUsers((prev) =>
          prev?.map((m) =>
            m.user.id === userId
              ? { ...m, membership: { ...m.membership, status } }
              : m
          ) ?? null
        );
      } else {
        toast.addToast("error", getErrorMessage(res, data));
      }
    } catch {
      toast.addToast("error", "Something went wrong. Please try again.");
    } finally {
      setStatusLoadingId(null);
    }
  };

  const handleRole = async (userId: string, role: string) => {
    setRoleLoadingId(userId);
    try {
      const res = await fetch(`/api/tenant/users/${userId}/role`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role }),
      });
      const data = (await res.json()) as { error?: string; message?: string };
      if (res.ok) {
        setUsers((prev) =>
          prev?.map((m) =>
            m.user.id === userId ? { ...m, roles: [role] } : m
          ) ?? null
        );
      } else {
        toast.addToast("error", getErrorMessage(res, data));
      }
    } catch {
      toast.addToast("error", "Something went wrong. Please try again.");
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

  // Reset copy button to default state after 2s
  useEffect(() => {
    if (copiedUserId === null) return;
    const t = setTimeout(() => setCopiedUserId(null), 2000);
    return () => clearTimeout(t);
  }, [copiedUserId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Spinner size="sm" />
        <span className="text-sm text-(--text-muted)">Loading members…</span>
      </div>
    );
  }

  const isEmpty = !users?.length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-(--text-primary)">Members</h2>
        <button
          type="button"
          onClick={() => setInviteOpen(true)}
          className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
        >
          Invite people
        </button>
      </div>

      <InviteMemberModal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        workspaceName={tenant.name}
        onSuccess={refetch}
      />

      {isEmpty ? (
        <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-8 text-center">
          <p className="text-sm text-(--text-secondary)">
            Invite teammates to collaborate in this workspace.
          </p>
          <button
            type="button"
            onClick={() => setInviteOpen(true)}
            className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Invite people
          </button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-(--border-subtle)">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--border-subtle) bg-(--bg-surface-elev)">
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">User</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Role</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Status</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Joined</th>
                <th className="px-4 py-3 text-right font-medium text-(--text-primary)">Actions</th>
              </tr>
            </thead>
            <tbody>
              {users?.map((m) => {
                const isOwner = m.roles.includes("Owner");
                const isLastOwner = isOwner && ownerCount <= 1;
                const role = m.roles[0] ?? "Member";
                return (
                  <tr key={m.user.id} className="border-b border-(--border-subtle) last:border-0">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {m.user.image ? (
                          <img src={m.user.image} alt="" className="h-8 w-8 rounded-full object-cover" />
                        ) : (
                          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-(--bg-surface-elev) text-xs text-(--text-muted)">
                            {(m.user.name ?? m.user.email ?? "?").slice(0, 1).toUpperCase()}
                          </div>
                        )}
                        <div>
                          <span className="font-medium text-(--text-primary)">{m.user.name ?? "—"}</span>
                          <span className="block text-(--text-muted)">{m.user.email ?? "—"}</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex min-w-16 items-center gap-1.5">
                        {roleLoadingId === m.user.id ? (
                          <Spinner size="sm" />
                        ) : (
                          <span className="rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs font-medium text-(--text-primary)">
                            {role}
                          </span>
                        )}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-(--text-secondary)">{m.membership.status}</td>
                    <td className="px-4 py-3 text-(--text-muted)">
                      {m.membership.joinedAt ? new Date(m.membership.joinedAt).toLocaleDateString() : "—"}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => copyEmail(m.user.id, m.user.email ?? null)}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs transition-colors ${
                            copiedUserId === m.user.id
                              ? "bg-(--bg-surface-elev) text-(--text-primary)"
                              : "bg-(--bg-surface-elev) text-(--color-primary) hover:bg-[color-mix(in_srgb,var(--color-primary)_10%,transparent)]"
                          }`}
                          aria-label={copiedUserId === m.user.id ? "Copied" : "Copy email"}
                        >
                          {copiedUserId === m.user.id ? (
                            <IconCheck size={14} />
                          ) : (
                            <IconCopy size={14} />
                          )}
                          <span>Copy Email</span>
                        </button>
                        {!isLastOwner && (
                          <>
                            <select
                              value={role}
                              onChange={(e) => handleRole(m.user.id, e.target.value)}
                              disabled={roleLoadingId === m.user.id}
                              className="rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
                            >
                              {["Owner", "Admin", "Finance", "Member"].map((r) => (
                                <option key={r} value={r}>{r}</option>
                              ))}
                            </select>
                            {m.membership.status === "ACTIVE" ? (
                              <button
                                type="button"
                                onClick={() => handleStatus(m.user.id, "DISABLED")}
                                disabled={statusLoadingId === m.user.id || isLastOwner}
                                className="inline-flex min-w-18 items-center justify-center rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev) disabled:opacity-60"
                              >
                                {statusLoadingId === m.user.id ? (
                                  <Spinner size="sm" className="text-(--color-danger)" />
                                ) : (
                                  "Disable"
                                )}
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleStatus(m.user.id, "ACTIVE")}
                                disabled={statusLoadingId === m.user.id}
                                className="inline-flex min-w-18 items-center justify-center rounded px-2 py-1 text-xs text-(--color-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
                              >
                                {statusLoadingId === m.user.id ? (
                                  <Spinner size="sm" className="text-(--color-primary)" />
                                ) : (
                                  "Enable"
                                )}
                              </button>
                            )}
                          </>
                        )}
                        {isLastOwner && (
                          <span className="text-xs text-(--text-muted)" title="Cannot change or disable the last owner">
                            —
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
