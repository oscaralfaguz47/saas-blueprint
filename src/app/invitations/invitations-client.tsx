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
  role: string;
  invitedBy: { name: string | null; email: string | null } | null;
};

type Props = {
  activeWorkspaces: WorkspaceItem[];
  pendingInvitations: PendingInvitationItem[];
};

const REVOKED_OR_EXPIRED_CODE = "INVITATION_REVOKED_OR_EXPIRED";

const ROLE_COLORS: Record<string, string> = {
  Owner: "#7c3aed",
  Admin: "#2563eb",
  Finance: "#16a34a",
  Member: "#71717a",
};

function workspaceInitials(name: string): string {
  const s = name.trim();
  if (!s) return "WS";
  const parts = s.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return s.slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function formatExpiry(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diffMs = d.getTime() - now.getTime();
  const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return "Expires today";
  if (diffDays === 1) return "Expires tomorrow";
  if (diffDays <= 7) return `Expires in ${diffDays} days`;
  return `Expires ${d.toLocaleDateString("en-US", { month: "short", day: "numeric" })}`;
}

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
  const [justAcceptedWorkspace, setJustAcceptedWorkspace] = useState<{
    name: string;
    tenantId: string;
  } | null>(null);

  async function handleAccept(inv: PendingInvitationItem) {
    setAcceptingId(inv.id);
    setRevokedOrExpiredMessage(null);
    setJustAcceptedWorkspace(null);
    try {
      const res = await apiFetch(`/api/tenant/invitations/${inv.id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        showToastOnError: false,
      });
      if (res.ok) {
        setPendingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
        setJustAcceptedWorkspace({ name: inv.workspaceName, tenantId: inv.tenantId });
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        details?: { code?: string };
        message?: string;
      };
      if (res.status === 404 || data.details?.code === REVOKED_OR_EXPIRED_CODE) {
        setPendingInvitations((prev) => prev.filter((i) => i.id !== inv.id));
        setRevokedOrExpiredMessage(
          "This invitation was revoked or has expired and was removed from the list.",
        );
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
    setJustAcceptedWorkspace(null);
    try {
      const res = await apiFetch(`/api/tenant/invitations/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
        showToastOnError: false,
      });
      if (res.ok) {
        setPendingInvitations((prev) => prev.filter((i) => i.id !== id));
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as {
        details?: { code?: string };
        message?: string;
      };
      if (res.status === 404 || data.details?.code === REVOKED_OR_EXPIRED_CODE) {
        setPendingInvitations((prev) => prev.filter((i) => i.id !== id));
        setRevokedOrExpiredMessage(
          "This invitation was revoked or has expired and was removed from the list.",
        );
        return;
      }
      addToast("error", data.message ?? "Something went wrong. Please try again.");
    } finally {
      setDecliningId(null);
    }
  }

  const defaultWorkspace = activeWorkspaces.find((w) => w.isDefault) ?? activeWorkspaces[0];
  const backHref = defaultWorkspace ? "/app/requests" : "/";

  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="mx-auto max-w-2xl px-4 py-8 sm:px-6">

        {/* Header */}
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

        {/* Just accepted success banner */}
        {justAcceptedWorkspace && (
          <div className="mb-6 flex items-center justify-between gap-4 rounded-xl border border-(--color-success) bg-(--color-success)/8 px-4 py-4">
            <div className="flex items-center gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-(--color-success)/15 text-xs font-bold text-(--color-success) uppercase">
                {workspaceInitials(justAcceptedWorkspace.name)}
              </span>
              <div>
                <p className="text-sm font-medium text-(--text-primary)">
                  You joined <span className="font-semibold">{justAcceptedWorkspace.name}</span>
                </p>
                <p className="text-xs text-(--text-muted)">
                  You now have access to this workspace.
                </p>
              </div>
            </div>
            <Link
              href="/app/requests"
              onClick={() => router.refresh()}
              className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-(--color-primary) px-3 py-2 text-sm font-semibold text-white hover:bg-(--color-primary-hover)"
            >
              Go to workspace →
            </Link>
          </div>
        )}

        {/* Revoked/expired warning */}
        {revokedOrExpiredMessage && (
          <div className="mb-6 flex items-start gap-3 rounded-xl border border-(--color-warning) bg-(--color-warning)/8 px-4 py-3">
            <p className="flex-1 text-sm text-(--text-primary)">{revokedOrExpiredMessage}</p>
            <button
              type="button"
              onClick={() => setRevokedOrExpiredMessage(null)}
              className="shrink-0 rounded p-1 text-(--text-muted) hover:text-(--text-primary)"
              aria-label="Dismiss"
            >
              <IconX size={16} />
            </button>
          </div>
        )}

        {/* Active workspaces */}
        <section className="mb-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
            Active workspaces
          </h2>
          {activeWorkspaces.length === 0 ? (
            <p className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm text-(--text-secondary)">
              You are not in any workspace yet. Accept an invitation below or create your own.
            </p>
          ) : (
            <ul className="space-y-2">
              {activeWorkspaces.map((w) => (
                <li key={w.tenantId}>
                  <Link
                    href="/app/requests"
                    className="flex items-center gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 hover:bg-(--bg-surface-elev) transition-colors"
                  >
                    {w.logoObjectKey ? (
                      <img
                        src={`/api/tenant/${w.tenantId}/logo?v=${encodeURIComponent(w.logoObjectKey)}`}
                        alt=""
                        className="h-8 w-8 shrink-0 rounded-lg border border-(--border-subtle) object-cover"
                      />
                    ) : (
                      <span className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) text-xs font-bold text-(--text-primary) uppercase">
                        {workspaceInitials(w.name)}
                      </span>
                    )}
                    <span className="flex-1 text-sm font-medium text-(--text-primary)">
                      {w.name}
                    </span>
                    {w.isDefault && (
                      <span className="shrink-0 rounded-full border border-(--border-subtle) bg-(--bg-surface-elev) px-2 py-0.5 text-[10px] font-medium text-(--text-muted)">
                        Current
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Pending invitations */}
        <section>
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-(--text-muted)">
            Pending invitations
          </h2>
          {pendingInvitations.length === 0 && !justAcceptedWorkspace ? (
            <p className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm text-(--text-secondary)">
              No pending invitations.
            </p>
          ) : pendingInvitations.length === 0 ? null : (
            <ul className="space-y-3">
              {pendingInvitations.map((inv) => (
                <li
                  key={inv.id}
                  className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-4"
                >
                  <div className="flex items-start gap-3">
                    <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) text-xs font-bold text-(--text-primary) uppercase">
                      {workspaceInitials(inv.workspaceName)}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-(--text-primary) truncate">
                        {inv.workspaceName}
                      </p>
                      <p className="mt-0.5 text-sm text-(--text-secondary)">
                        Invited by{" "}
                        {inv.invitedBy?.name ?? inv.invitedBy?.email ?? "Unknown"}
                      </p>
                      <div className="mt-1.5 flex items-center gap-3">
                        <span className="inline-flex items-center gap-1.5 text-xs text-(--text-muted)">
                          <span
                            className="h-2 w-2 shrink-0 rounded-full"
                            style={{ backgroundColor: ROLE_COLORS[inv.role] ?? "#71717a" }}
                          />
                          {inv.role}
                        </span>
                        <span className="text-xs text-(--text-muted)">·</span>
                        <span className="text-xs text-(--text-muted)">
                          {formatExpiry(inv.expiresAt)}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleAccept(inv)}
                      disabled={!!acceptingId || !!decliningId}
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-semibold text-white hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
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
                      className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-2 text-sm font-semibold text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
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
