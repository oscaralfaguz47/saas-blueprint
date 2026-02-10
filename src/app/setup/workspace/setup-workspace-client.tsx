"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { signOut } from "next-auth/react";
import { useApiFetch } from "@/hooks/use-api-fetch";
import AuthCard from "@/components/auth/auth-card";
import { Spinner } from "@/components/ui/spinner";
import { CLAIM_SLUG_MIN, CLAIM_SLUG_MAX } from "@/lib/validations";

type SetupWorkspaceClientProps = {
  /** When set, user has a valid pending invite for this workspace (from server lookup by email). Show hint to use email link. */
  pendingInviteWorkspaceName?: string | null;
};

export default function SetupWorkspaceClient({ pendingInviteWorkspaceName = null }: SetupWorkspaceClientProps) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [slug, setSlug] = useState("");
  const [checking, setChecking] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function checkAvailability() {
    const raw = slug.trim().toLowerCase();
    if (raw.length < CLAIM_SLUG_MIN) {
      setError(`Enter at least ${CLAIM_SLUG_MIN} characters`);
      setAvailable(null);
      return;
    }
    if (raw.length > CLAIM_SLUG_MAX) {
      setError(`Maximum ${CLAIM_SLUG_MAX} characters`);
      setAvailable(null);
      return;
    }
    setError(null);
    setChecking(true);
    setAvailable(null);
    try {
      const res = await apiFetch(
        `/api/workspaces/check-slug?slug=${encodeURIComponent(raw)}`,
        { showToastOnError: false }
      );
      const json = await res.json();
      const data = json?.data ?? json;
      setAvailable(typeof data?.available === "boolean" ? data.available : null);
    } catch {
      setAvailable(null);
    } finally {
      setChecking(false);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const raw = slug.trim().toLowerCase();
    if (!raw) {
      setError("Enter a workspace URL");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/workspaces/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: raw }),
      });
      const json = await res.json();
      if (res.ok && (json?.data ?? json)) {
        router.replace("/app/requests");
        return;
      }
      const err = json?.error ?? json?.message ?? "Something went wrong";
      const details = json?.details as { code?: string; slug?: string } | undefined;
      if (details?.code === "SLUG_TAKEN") {
        setError("This workspace URL is already taken. Choose another.");
      } else {
        setError(typeof err === "string" ? err : "Failed to claim workspace");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to claim workspace");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <AuthCard
          title="Claim your workspace"
          subtitle="Choose a URL for your workspace. You can use letters, numbers, and hyphens (3–80 characters)."
          badgeText="Setup"
        >
          {pendingInviteWorkspaceName && (
            <div
              className="mb-4 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm text-(--text-secondary)"
              role="status"
            >
              You have an invite to <span className="font-medium text-(--text-primary)">{pendingInviteWorkspaceName}</span>.
              Use the link in your email to join, or create your own workspace below.
            </div>
          )}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="slug" className="mb-1 block text-xs font-medium text-(--text-secondary)">
                Workspace URL
              </label>
              <div className="flex gap-2">
                <input
                  id="slug"
                  type="text"
                  value={slug}
                  onChange={(e) => {
                    setSlug(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase().slice(0, CLAIM_SLUG_MAX));
                    setAvailable(null);
                    setError(null);
                  }}
                  placeholder="my-workspace"
                  minLength={CLAIM_SLUG_MIN}
                  maxLength={CLAIM_SLUG_MAX}
                  disabled={submitting}
                  className="h-11 flex-1 rounded-lg border border-(--border-subtle) bg-(--bg-main) px-3 text-sm text-(--text-primary) outline-none transition-colors placeholder:text-(--text-muted) focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
                  aria-describedby={error ? "slug-error" : available !== null ? "slug-availability" : undefined}
                />
                <button
                  type="button"
                  onClick={checkAvailability}
                  disabled={checking || submitting || slug.trim().length < CLAIM_SLUG_MIN}
                  className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {checking ? <Spinner size="sm" /> : "Check"}
                </button>
              </div>
              {available === true && (
                <p id="slug-availability" className="mt-1 text-sm text-(--color-success)">
                  Available
                </p>
              )}
              {available === false && (
                <p id="slug-availability" className="mt-1 text-sm text-(--color-danger)">
                  Already taken
                </p>
              )}
              {error && (
                <p id="slug-error" className="mt-1 text-sm text-(--color-danger)" role="alert">
                  {error}
                </p>
              )}
            </div>
            <button
              type="submit"
              disabled={submitting || slug.trim().length < CLAIM_SLUG_MIN}
              className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  Claiming…
                </>
              ) : (
                "Claim workspace"
              )}
            </button>
            <p className="text-center text-sm text-(--text-muted)">
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: "/auth/sign-in" })}
                className="font-medium text-(--text-secondary) underline hover:text-(--text-primary)"
              >
                Sign out and do it later
              </button>
            </p>
          </form>
        </AuthCard>
      </div>
    </main>
  );
}
