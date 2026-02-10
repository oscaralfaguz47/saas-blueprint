"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

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
  error: string;
  message?: string;
  expectedEmail?: string;
  currentEmail?: string | null;
  details?: { expectedEmail?: string; currentEmail?: string | null };
};

type AcceptResult =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; data: ApiAcceptOk }
  | { kind: "email_mismatch"; data: ApiEmailMismatch }
  | { kind: "error"; data: { error: string; message?: string } };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function getPayload(raw: unknown): unknown {
  if (isObject(raw) && "data" in raw) return (raw as { data: unknown }).data;
  return raw;
}

export default function InviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();

  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [validateState, setValidateState] = useState<ValidateState>("idle");
  const [validatePayload, setValidatePayload] = useState<ValidateResult | null>(null);
  const [result, setResult] = useState<AcceptResult>({ kind: "idle" });

  useEffect(() => {
    if (!token || token.length < 20) {
      setValidateState("invalid");
      return;
    }
    setValidateState("loading");
    fetch(`/api/tenant/invitations/validate?token=${encodeURIComponent(token)}`)
      .then((r) => r.json())
      .then((j: unknown) => {
        const d = isObject(j) && "data" in j ? (j as { data: ValidateResult }).data : (j as ValidateResult);
        if (d && typeof d.valid === "boolean") {
          setValidatePayload(d);
          setValidateState(d.valid ? "valid" : (d.state as ValidateState) ?? "invalid");
        } else {
          setValidateState("invalid");
        }
      })
      .catch(() => setValidateState("invalid"));
  }, [token]);

  async function acceptInvitation() {
    if (!token) {
      setResult({ kind: "error", data: { error: "MISSING_TOKEN", message: "Missing invitation token." } });
      return;
    }
    setResult({ kind: "submitting" });
    try {
      const res = await fetch("/api/tenant/invitations/accept", {
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

      const details = (body.details ?? payload?.details) as { expectedEmail?: string; currentEmail?: string | null } | undefined;
      const expectedEmail = (payload?.expectedEmail ?? details?.expectedEmail ?? body.expectedEmail) as string | undefined;
      if (expectedEmail != null) {
        setResult({
          kind: "email_mismatch",
          data: {
            error: "EMAIL_MISMATCH",
            message: (payload?.message ?? body.message) as string | undefined,
            expectedEmail,
            currentEmail: (payload?.currentEmail ?? details?.currentEmail ?? body.currentEmail) as string | null | undefined,
          },
        });
        return;
      }

      setResult({
        kind: "error",
        data: {
          error: (payload?.error ?? body.error) as string ?? "UNKNOWN",
          message: (payload?.message ?? body.message) as string | undefined,
        },
      });
    } catch (err) {
      setResult({
        kind: "error",
        data: { error: "CLIENT_ERROR", message: err instanceof Error ? err.message : "Unknown error" },
      });
    }
  }

  async function signOutAndContinue() {
    if (!token) return;
    const callbackUrl = `/invite?token=${encodeURIComponent(token)}`;
    await signOut({ callbackUrl: `/auth/sign-in?callbackUrl=${encodeURIComponent(callbackUrl)}` });
  }

  const workspaceName = validatePayload?.workspaceName ?? "this workspace";
  const currentEmail = session?.user?.email ?? null;

  if (validateState === "loading" || (validateState === "valid" && authStatus === "loading")) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-xl font-semibold text-(--text-primary)">Accept Invitation</h1>
        <p className="mt-2 text-(--text-secondary)">Validating invitation…</p>
      </main>
    );
  }

  if (validateState === "valid" && authStatus === "unauthenticated") {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-xl font-semibold text-(--text-primary)">Join {workspaceName}</h1>
        <p className="mt-2 text-(--text-secondary)">Sign in or create an account to accept this invitation.</p>
        <div className="mt-6 flex flex-col gap-3">
          <Link
            href={`/auth/sign-in?callbackUrl=${encodeURIComponent(`/invite?token=${encodeURIComponent(token)}`)}`}
            className="inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Sign in
          </Link>
          {/* TODO: replace with /auth/sign-up when signup flow exists */}
          <Link
            href={`/auth/sign-in?callbackUrl=${encodeURIComponent(`/invite?token=${encodeURIComponent(token)}`)}`}
            className="inline-flex h-11 items-center justify-center rounded-lg border border-(--border-subtle) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
          >
            Create account
          </Link>
        </div>
      </main>
    );
  }

  if (validateState === "invalid" || validateState === "expired" || validateState === "revoked" || validateState === "accepted") {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-xl font-semibold text-(--text-primary)">Invalid invitation</h1>
        <p className="mt-2 text-(--text-secondary)">
          This invitation link is no longer valid.
        </p>
        <p className="mt-4 text-sm text-(--text-muted)">
          Contact your workspace admin for a new invite.
        </p>
      </main>
    );
  }

  if (!token) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-xl font-semibold text-(--text-primary)">Invalid invitation</h1>
        <p className="mt-2 text-(--text-secondary)">Missing token.</p>
      </main>
    );
  }

  if (result.kind === "ok" && result.data.alreadyMember) {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-xl font-semibold text-(--text-primary)">Already a member</h1>
        <p className="mt-2 text-(--text-secondary)">You already belong to this workspace.</p>
        <Link
          href="/app/requests"
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
        >
          Go to workspace
        </Link>
      </main>
    );
  }

  if (result.kind === "email_mismatch") {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-xl font-semibold text-(--text-primary)">Wrong account</h1>
        <p className="mt-2 text-(--text-secondary)">
          This invite was sent to <strong>{result.data.expectedEmail}</strong>, but you&apos;re signed in as{" "}
          <strong>{currentEmail ?? "Unknown"}</strong>.
        </p>
        <button
          type="button"
          onClick={signOutAndContinue}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg border border-(--border-subtle) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Sign out and continue
        </button>
      </main>
    );
  }

  if (validateState === "valid" && authStatus === "authenticated") {
    return (
      <main className="mx-auto max-w-md px-6 py-12">
        <h1 className="text-xl font-semibold text-(--text-primary)">Join {workspaceName}</h1>
        <p className="mt-2 text-(--text-secondary)">
          You&apos;re signed in as {currentEmail}. Click below to join.
        </p>
        <button
          type="button"
          onClick={acceptInvitation}
          disabled={result.kind === "submitting"}
          className="mt-6 inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
        >
          {result.kind === "submitting" ? "Joining…" : "Join workspace"}
        </button>
        {result.kind === "error" && (
          <p className="mt-4 text-sm text-(--color-danger)">{result.data.message ?? result.data.error}</p>
        )}
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-md px-6 py-12">
      <h1 className="text-xl font-semibold text-(--text-primary)">Accept Invitation</h1>
      <p className="mt-2 text-(--text-secondary)">Loading…</p>
    </main>
  );
}
