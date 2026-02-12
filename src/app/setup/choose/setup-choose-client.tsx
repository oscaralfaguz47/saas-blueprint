"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import AuthCard from "@/components/auth/auth-card";
import { Spinner } from "@/components/ui/spinner";
import type { PendingInvitationItem } from "./page";

type SetupChooseClientProps = {
  invitations: PendingInvitationItem[];
};

export default function SetupChooseClient({ invitations }: SetupChooseClientProps) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [list, setList] = useState(invitations);
  const [acceptingId, setAcceptingId] = useState<string | null>(null);
  const [decliningId, setDecliningId] = useState<string | null>(null);

  async function handleAccept(id: string) {
    setAcceptingId(id);
    try {
      const res = await apiFetch(`/api/tenant/invitations/${id}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) router.replace("/app/requests");
    } finally {
      setAcceptingId(null);
    }
  }

  async function handleDecline(id: string) {
    setDecliningId(id);
    try {
      const res = await apiFetch(`/api/tenant/invitations/${id}/reject`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      if (res.ok) {
        setList((prev) => prev.filter((inv) => inv.id !== id));
        if (list.length <= 1) router.replace("/setup/workspace");
      }
    } finally {
      setDecliningId(null);
    }
  }

  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <AuthCard
          title="Choose how you want to start"
          subtitle="You have pending workspace invitations. Accept one or create your own workspace."
          badgeText="Setup"
        >
          <div className="space-y-4">
            {list.map((inv) => (
              <div
                key={inv.id}
                className="rounded-lg border border-(--border-subtle) bg-(--bg-main) p-4"
              >
                <p className="font-medium text-(--text-primary)">
                  {inv.workspaceName}
                </p>
                <p className="mt-1 text-sm text-(--text-secondary)">
                  Invited by{" "}
                  {inv.invitedByName ?? inv.invitedByEmail ?? "Unknown"} · Role:{" "}
                  {inv.roleOffered}
                </p>
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => handleAccept(inv.id)}
                    disabled={!!acceptingId || !!decliningId}
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-(--color-primary) px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
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
                    className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {decliningId === inv.id ? <Spinner size="sm" /> : null}
                    Decline
                  </button>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 border-t border-(--border-subtle) pt-6">
            <p className="text-sm font-medium text-(--text-secondary)">
              Or create your own workspace
            </p>
            <Link
              href="/setup/workspace"
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev)"
            >
              Create Workspace
            </Link>
          </div>
        </AuthCard>
      </div>
    </main>
  );
}
