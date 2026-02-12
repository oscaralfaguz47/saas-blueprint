"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Spinner } from "@/components/ui/spinner";
import { IconX } from "@/components/ui/icons";

type WorkspaceItem = {
  tenantId: string;
  name: string;
  slug: string;
  status: string;
  isDefault: boolean;
  logoObjectKey: string | null;
};

type PendingInvitationItem = {
  id: string;
  tenantId: string;
  workspaceName: string;
  invitedAt: string;
  expiresAt: string;
  invitedBy: { name: string | null; email: string | null } | null;
};

type Props = {
  activeWorkspaces: WorkspaceItem[];
  pendingInvitations: PendingInvitationItem[];
};

const REVOKED_OR_EXPIRED_CODE = "INVITATION_REVOKED_OR_EXPIRED";

export default function InvitationsClient({
  activeWorkspaces: initialWorkspaces,
  pendingInvitations: initialPending,
}: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const { addToast } = useToast();
  const [activeWorkspaces] = useState(initialWorkspaces);
  const [pendingInvitations, setPendingInvitations] = useState(initialPending);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);
  const [revokedOrExpiredMessage, setRevokedOrExpiredMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setAcceptingId(id);
    setRevokedOrExpiredMessage(null);
    setSuccessMessage(null);
    try {
      const res = await apiFetch(`/api/tenant/invitations/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        showToastOnError: false,
      });
      if (res.ok) {
        setPendingInvitations((prev) => prev.filter((inv) => inv.id !== id));
        setSuccessMessage("You joined the workspace.");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { details?: { code?: string }; message?: string };
      if (res.status === 404 || data.details?.code === REVOKED_OR_EXPIRED_CODE) {
        setPendingInvitations((prev) => prev.filter((inv) => inv.id !== id));
        setRevokedOrExpiredMessage("This invitation was revoked or has expired and was removed from the list.");
        return;
      }
      addToast("error", data.message ?? "Something went wrong. Please try again.");
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleDecline(id: string) {
    setDecliningId(id);
    setRevokedOrExpiredMessage(null);
    setSuccessMessage(null);
    try {
      const res = await apiFetch(`/api/tenant/invitations/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        showToastOnError: false,
      });
      if (res.ok) {
        setPendingInvitations((prev) => prev.filter((inv) => inv.id !== id));
        setSuccessMessage("Invitation declined.");
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { details?: { code?: string }; message?: string };
      if (res.status === 404 || data.details?.code === REVOKED_OR_EXPIRED_CODE) {
        setPendingInvitations((prev) => prev.filter((inv) => inv.id !== id));
        setRevokedOrExpiredMessage("This invitation was revoked or has expired and was removed from the list.");
        return;
      }
      addToast("error", data.message ?? "Something went wrong. Please try again.");
    } finally {
      setDecliningId(null);
    }
  }

  function dismissSuccess() {
    setSuccessMessage(null);
  }

  function dismissRevokedOrExpired() {
    setRevokedOrExpiredMessage(null);
  }

  const defaultWorkspace = activeWorkspaces.find((w) => w.isDefault) ?? activeWorkspaces[0];
  const backHref = defaultWorkspace ? "/app/requests" : "/";

  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">
        <div className="mb-8 flex items-center gap-4">
          <Link
            href={backHref}
            className="text-sm font-medium text-(--text-secondary) hover:text-(--text-primary)"
          >
            ← Back
          </Link>
          <h1 className="text-xl font-semibold text-(--text-primary)">
            Workspace invitations
          </h1>
        </div>

        <section className="mb-10">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-(--text-secondary)">
            Active workspaces
          </h2>
          {activeWorkspaces.length === 0 ? (
            <p className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm text-(--text-secondary)">
              You are not in any workspace yet. Accept an invitation below or create your own.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeWorkspaces.map((w) => (
                <li key={w.tenantId}>
                  <Link
                    href="/app/requests"
                    className="block rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
                  >
                    {w.name}
                    {w.isDefault ? (
                      <span className="ml-2 text-xs text-(--text-muted)">(current)</span>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-(--text-secondary)">
            Pending invitations
          </h2>
          {successMessage ? (
            <div
              className="mb-4 flex items-start gap-3 rounded-lg border border-(--color-success) bg-(--color-success)/10 px-4 py-3 text-sm text-(--text-primary)"
              role="status"
            >
              <p className="flex-1">{successMessage}</p>
              <button
                type="button"
                onClick={dismissSuccess}
                className="shrink-0 rounded p-1 text-(--text-muted) hover:bg-black/5 hover:text-(--text-primary)"
                aria-label="Dismiss"
              >
                <IconX size={16} />
              </button>
            </div>
          ) : null}
          {revokedOrExpiredMessage ? (
            <div
              className="mb-4 flex items-start gap-3 rounded-lg border border-(--color-warning) bg-(--color-warning)/10 px-4 py-3 text-sm text-(--text-primary)"
              role="alert"
            >
              <p className="flex-1">{revokedOrExpiredMessage}</p>
              <button
                type="button"
                onClick={dismissRevokedOrExpired}
                className="shrink-0 rounded p-1 text-(--text-muted) hover:bg-black/5 hover:text-(--text-primary)"
                aria-label="Dismiss"
              >
                <IconX size={16} />
              </button>
            </div>
          ) : null}
          {pendingInvitations.length === 0 ? (
            <p className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm text-(--text-secondary)">
            No pending invitations.
            </p>
          ) : (
            <ul className="space-y-3">
              {pendingInvitations.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-4"
                >
                  <p className="font-medium text-(--text-primary)">
                    {inv.workspaceName}
                  </p>
                  <p className="mt-1 text-sm text-(--text-secondary)">
                    Invited by{" "}
                    {inv.invitedBy?.name ?? inv.invitedBy?.email ?? "Unknown"}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAccept(inv.id)}
                      disabled={!!acceptingId || !!decliningId}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) px-3 py-2 text-sm font-semibold text-white hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {acceptingId === inv.id ? (
                        <Spinner size="sm" className="text-white" />
                      ) : null}
                      Accept
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecline(inv.id)}
                      disabled={!!acceptingId || !!decliningId}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm font-semibold text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {decliningId === inv.id ? <Spinner size="sm" /> : null}
                      Decline
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
