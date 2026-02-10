"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { InviteMemberModal } from "./invite-member-modal";

type Tenant = { id: string; name: string };

type Invitation = {
  id: string;
  email: string;
  status: string;
  invitedBy: { name: string | null; email: string | null } | null;
  invitedAt: string;
  expiresAt: string;
};

type Props = { tenant: Tenant };

export function WorkspaceInvitesTab({ tenant }: Props) {
  const router = useRouter();
  const [invitations, setInvitations] = useState<Invitation[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const refetch = () => {
    setLoading(true);
    fetch("/api/tenant/invitations")
      .then((r) => r.json())
      .then((j: { data?: { invitations?: Invitation[] } }) => {
        setInvitations((j.data?.invitations ?? []) as Invitation[]);
      })
      .catch(() => setInvitations([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    refetch();
  }, []);

  const runAction = async (id: string, path: "resend" | "revoke" | "reinvite") => {
    setActionLoading(id);
    try {
      const res = await fetch(`/api/tenant/invitations/${id}/${path}`, { method: "POST" });
      if (res.ok) {
        router.refresh();
        refetch();
      }
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-8">
        <Spinner size="sm" />
        <span className="text-sm text-(--text-muted)">Loading invitations…</span>
      </div>
    );
  }

  const isEmpty = !invitations?.length;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-(--text-primary)">Invitations</h2>
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
          <p className="text-sm text-(--text-secondary)">No invitations yet.</p>
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
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Email</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Status</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Invited by</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Invited at</th>
                <th className="px-4 py-3 text-left font-medium text-(--text-primary)">Expires at</th>
                <th className="px-4 py-3 text-right font-medium text-(--text-primary)">Actions</th>
              </tr>
            </thead>
            <tbody>
              {invitations?.map((inv) => (
                <tr key={inv.id} className="border-b border-(--border-subtle) last:border-0">
                  <td className="px-4 py-3 text-(--text-primary)">{inv.email}</td>
                  <td className="px-4 py-3">
                    <span className="inline-flex rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs font-medium text-(--text-primary)">
                      {inv.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-(--text-muted)">
                    {inv.invitedBy?.name ?? inv.invitedBy?.email ?? "—"}
                  </td>
                  <td className="px-4 py-3 text-(--text-muted)">
                    {new Date(inv.invitedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-(--text-muted)">
                    {new Date(inv.expiresAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {inv.status === "ACTIVE" && (
                        <>
                          <button
                            type="button"
                            onClick={() => runAction(inv.id, "resend")}
                            disabled={actionLoading === inv.id}
                            className="rounded px-2 py-1 text-xs text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
                          >
                            Resend
                          </button>
                          <button
                            type="button"
                            onClick={() => runAction(inv.id, "revoke")}
                            disabled={actionLoading === inv.id}
                            className="rounded px-2 py-1 text-xs text-(--color-danger) hover:bg-(--bg-surface-elev) disabled:opacity-60"
                          >
                            Revoke
                          </button>
                        </>
                      )}
                      {(inv.status === "EXPIRED" || inv.status === "REVOKED") && (
                        <button
                          type="button"
                          onClick={() => runAction(inv.id, "reinvite")}
                          disabled={actionLoading === inv.id}
                          className="rounded px-2 py-1 text-xs text-(--color-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
                        >
                          Re-invite
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
