"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { useApiFetch } from "@/hooks/use-api-fetch";
import AuthCard from "@/components/auth/auth-card";
import { Spinner } from "@/components/ui/spinner";

type ValidateState = "idle" | "loading" | "invalid" | "expired" | "revoked" | "accepted" | "valid";
type ValidateResult = {
  valid: boolean;
  state: string;
  workspaceName?: string;
  invitedEmail?: string;
};

type ApiAcceptOk = {
  ok: true;
  alreadyMember?: boolean;
  invitationId?: string;
  tenantId?: string;
  membershipCreated?: boolean;
  membershipId?: string;
};

type ApiEmailMismatch = {
  error?: { code?: string; message?: string; details?: { expectedEmail?: string; currentEmail?: string | null } };
  expectedEmail?: string;
  currentEmail?: string | null;
};

type AcceptResult =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; data: ApiAcceptOk }
  | { kind: "email_mismatch"; data: ApiEmailMismatch }
  | { kind: "error"; data: { error?: { code?: string; message?: string } } };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getPayload(raw: unknown): unknown {
  if (isObject(raw) && "data" in raw) return (raw as { data: unknown }).data;
  return raw;
}

type InviteClientProps = {
  /** When true, invalid/expired/revoked invite shows "Continue to my workspace" → /app/requests instead of setup */
  hasActiveWorkspace?: boolean;
};

export default function InviteClient({ hasActiveWorkspace = false }: InviteClientProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const apiFetch = useApiFetch();
  const { data: session, status: authStatus } = useSession();

  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [validateState, setValidateState] = useState<ValidateState>("idle");
  const [validatePayload, setValidatePayload] = useState<ValidateResult | null>(null);
  const [result, setResult] = useState<AcceptResult>({ kind: "idle" });
  const [rejectSubmitting, setRejectSubmitting] = useState(false);

  useEffect(() => {
    if (!token || token.length < 20) {
      setValidateState("invalid");
      return;
    }
    const controller = new AbortController();
    const signal = controller.signal;
    setValidateState("loading");
    apiFetch(`/api/tenant/invitations/validate?token=${encodeURIComponent(token)}`, { showToastOnError: false, signal })
      .then((r) => (signal.aborted ? null : r.json()))
      .then((j: unknown) => {
        if (signal.aborted) return;
        const d = isObject(j) && "data" in j ? (j as { data: ValidateResult }).data : (j as ValidateResult);
        if (d && typeof d.valid === "boolean") {
          setValidatePayload(d);
          setValidateState(d.valid ? "valid" : (d.state as ValidateState) ?? "invalid");
        } else {
          setValidateState("invalid");
        }
      })
      .catch(() => {
        if (!signal.aborted) setValidateState("invalid");
      });
    return () => controller.abort();
  }, [token]);

  async function acceptInvitation() {
    if (!token) {
      setResult({ kind: "error", data: { error: { code: "MISSING_TOKEN", message: "Missing invitation token." } } });
      return;
    }
    setResult({ kind: "submitting" });
    try {
      const res = await apiFetch("/api/tenant/invitations/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const raw: unknown = await res.json();
      const payload = getPayload(raw) as Record<string, unknown> | undefined;
      const body = isObject(raw) ? raw : (payload as Record<string, unknown>) ?? {};

      if (payload && payload.ok === true) {
        setResult({ kind: "ok", data: payload as ApiAcceptOk });
        if (res.ok && !(payload as ApiAcceptOk).alreadyMember) {
          router.replace("/app/requests");
        }
        return;
      }

      const errObj = (payload?.error ?? body.error) as Record<string, unknown> | undefined;
      const details = (errObj?.details ?? body.details ?? payload?.details) as { expectedEmail?: string; currentEmail?: string | null } | undefined;
      const expectedEmail = (details?.expectedEmail ?? payload?.expectedEmail ?? body.expectedEmail) as string | undefined;
      if (expectedEmail != null) {
        setResult({
          kind: "email_mismatch",
          data: {
            error: {
              code: "EMAIL_MISMATCH",
              message: (errObj?.message ?? payload?.message ?? body.message) as string | undefined,
            },
            expectedEmail,
            currentEmail: (details?.currentEmail ?? payload?.currentEmail ?? body.currentEmail) as string | null | undefined,
          },
        });
        return;
      }

      setResult({
        kind: "error",
        data: {
          error: {
            code: (errObj?.code as string) ?? "UNKNOWN",
            message: (errObj?.message as string) ?? "An error occurred",
          }
        },
      });
    } catch (err) {
      setResult({
        kind: "error",
        data: { error: { code: "CLIENT_ERROR", message: err instanceof Error ? err.message : "Unknown error" } },
      });
    }
  }

  async function signOutAndContinue() {
    if (!token) return;
    const callbackUrl = `/invite?token=${encodeURIComponent(token)}`;
    const signInUrl = `/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;
    await signOut({ callbackUrl: `/api/link/clear-cookie?redirect=${encodeURIComponent(signInUrl)}` });
  }

  async function rejectInvitation() {
    if (!token) return;
    setRejectSubmitting(true);
    try {
      const res = await apiFetch("/api/tenant/invitations/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const raw: unknown = await res.json();
      const payload = getPayload(raw) as { ok?: boolean; redirect?: string } | undefined;
      if (payload?.ok === true && typeof payload.redirect === "string") {
        router.replace(payload.redirect);
        return;
      }
    } finally {
      setRejectSubmitting(false);
    }
  }

  const workspaceName = validatePayload?.workspaceName ?? "this workspace";
  const currentEmail =
    session?.user?.email ?? session?.user?.name ?? null;

  const callbackUrl = `/invite?token=${encodeURIComponent(token)}`;
  const signInHref = `/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}`;

  if (validateState === "loading" || (validateState === "valid" && authStatus === "loading")) {
    return (
      <AuthCard
        title="Accept invitation"
        subtitle="Validating invitation…"
        badgeText="Invitation"
      >
        <div className="flex justify-center py-6">
          <Spinner size="md" />
        </div>
      </AuthCard>
    );
  }

  if (validateState === "valid" && authStatus === "unauthenticated") {
    return (
      <AuthCard
        title={`Join ${workspaceName}`}
        subtitle="Sign in or create an account to accept this invitation."
        badgeText="Invitation"
      >
        <div className="flex flex-col gap-3">
          <Link
            href={signInHref}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            Sign in
          </Link>
          <Link
            href={signInHref}
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev)"
          >
            Create account
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (validateState === "invalid" || validateState === "expired" || validateState === "revoked" || validateState === "accepted") {
    if (hasActiveWorkspace) {
      return (
        <AuthCard
          title="Invitation no longer valid"
          subtitle="This invitation has expired or was revoked. You can continue to your existing workspace."
          badgeText="Invitation"
        >
          <Link
            href="/app/requests"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            OK, continue to my workspace
          </Link>
        </AuthCard>
      );
    }
    if (authStatus === "unauthenticated") {
      return (
        <AuthCard
          title="Invalid invitation"
          subtitle="This invitation link is no longer valid. You can continue to set up your own workspace."
          badgeText="Invitation"
        >
          <Link
            href="/auth/sign-in"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            OK, continue to log in or create my workspace
          </Link>
        </AuthCard>
      );
    }
    return (
      <AuthCard
        title="Invalid invitation"
        subtitle="This invitation link is no longer valid. You can continue to set up your own workspace."
        badgeText="Invitation"
      >
        <div className="flex flex-col gap-3">
          <Link
            href="/setup/workspace"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
          >
            Continue setup
          </Link>
          <Link
            href="/"
            className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev)"
          >
            Back to home
          </Link>
        </div>
      </AuthCard>
    );
  }

  if (!token) {
    return (
      <AuthCard
        title="Invalid invitation"
        subtitle="Missing invitation token. Use the link from your invite email."
        badgeText="Invitation"
      >
        <Link
          href="/"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev)"
        >
          Back to home
        </Link>
      </AuthCard>
    );
  }

  if (result.kind === "ok" && result.data.alreadyMember) {
    return (
      <AuthCard
        title="Already a member"
        subtitle="You already belong to this workspace."
        badgeText="Invitation"
      >
        <Link
          href="/app/requests"
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
        >
          Go to workspace
        </Link>
      </AuthCard>
    );
  }

  if (result.kind === "email_mismatch") {
    const displayCurrent =
      result.data.currentEmail ?? currentEmail ?? "Unknown";
    return (
      <AuthCard
        title="Wrong account"
        subtitle={
          <>
            This invite was sent to <strong className="font-semibold text-(--text-primary)">{result.data.expectedEmail}</strong>, but you&apos;re signed in as{" "}
            <strong className="font-semibold text-(--text-primary)">{displayCurrent}</strong>.
          </>
        }
        badgeText="Invitation"
      >
        <button
          type="button"
          onClick={signOutAndContinue}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev)"
        >
          Sign out and use correct email
        </button>
      </AuthCard>
    );
  }

  const invitedEmail = validatePayload?.invitedEmail?.trim().toLowerCase();
  const sessionEmail = currentEmail?.trim().toLowerCase();
  const emailMismatch =
    validateState === "valid" &&
    authStatus === "authenticated" &&
    invitedEmail != null &&
    invitedEmail !== "" &&
    sessionEmail != null &&
    sessionEmail !== "" &&
    invitedEmail !== sessionEmail;

  if (emailMismatch) {
    return (
      <AuthCard
        title="Wrong account"
        subtitle={
          <>
            This invite was sent to <strong className="font-semibold text-(--text-primary)">{validatePayload!.invitedEmail}</strong>, but you&apos;re signed in as{" "}
            <strong className="font-semibold text-(--text-primary)">{currentEmail ?? "Unknown"}</strong>. If this is your account, try refreshing the page.
          </>
        }
        badgeText="Invitation"
      >
        <button
          type="button"
          onClick={signOutAndContinue}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev)"
        >
          Sign out and use correct email
        </button>
      </AuthCard>
    );
  }

  if (validateState === "valid" && authStatus === "authenticated") {
    return (
      <AuthCard
        title={`Join ${workspaceName}`}
        subtitle={
          <>
            You&apos;re signed in as <span className="font-medium text-(--text-primary)">{currentEmail}</span>. Click below to join.
          </>
        }
        badgeText="Invitation"
      >
        <div className="space-y-4">
          <button
            type="button"
            onClick={acceptInvitation}
            disabled={result.kind === "submitting" || rejectSubmitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {result.kind === "submitting" ? (
              <>
                <Spinner size="sm" className="text-white" />
                Joining…
              </>
            ) : (
              "Join workspace"
            )}
          </button>
          <button
            type="button"
            onClick={rejectInvitation}
            disabled={result.kind === "submitting" || rejectSubmitting}
            className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {rejectSubmitting ? (
              <>
                <Spinner size="sm" />
                Declining…
              </>
            ) : hasActiveWorkspace ? (
              "Decline and go to my workspace"
            ) : (
              "Decline and create my own workspace"
            )}
          </button>
          {result.kind === "error" && (
            <p className="text-center text-sm text-(--color-danger)" role="alert">
              {result.data.error?.message ?? "Something went wrong."}
            </p>
          )}
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Accept invitation"
      subtitle="Loading…"
      badgeText="Invitation"
    >
      <div className="flex justify-center py-6">
        <Spinner size="md" />
      </div>
    </AuthCard>
  );
}
