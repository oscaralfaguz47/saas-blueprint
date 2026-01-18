"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useSession, signOut } from "next-auth/react";

/**
 * Strong, discriminated result types (no "any", no unsafe property access).
 */

type ApiAcceptOk = {
  ok: true;
  invitationId?: string;
  tenantId?: string;
  membershipCreated?: boolean;
  membershipId?: string;
};

type ApiEmailMismatch = {
  error: "EMAIL_MISMATCH";
  message?: string;
  expectedEmail: string;
  currentEmail: string | null;
  nextAction?: string;
};

type ApiGenericError = {
  error: string;
  message?: string;
};

type AcceptResult =
  | { kind: "idle" }
  | { kind: "submitting" }
  | { kind: "ok"; status: number; data: ApiAcceptOk }
  | { kind: "email_mismatch"; status: number; data: ApiEmailMismatch }
  | { kind: "error"; status: number; data: ApiGenericError };

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null;
}

function normalizeApiResponse(data: unknown): ApiAcceptOk | ApiEmailMismatch | ApiGenericError {
  // OK response
  if (isObject(data) && data.ok === true) {
    return data as ApiAcceptOk;
  }

  // Known mismatch response
  if (isObject(data) && data.error === "EMAIL_MISMATCH") {
    // Defensive: ensure expectedEmail exists; if not, downgrade to generic error
    const expectedEmail = typeof data.expectedEmail === "string" ? data.expectedEmail : "";
    const currentEmail =
      typeof data.currentEmail === "string" ? data.currentEmail : null;

    if (expectedEmail) {
      return {
        error: "EMAIL_MISMATCH",
        message: typeof data.message === "string" ? data.message : undefined,
        expectedEmail,
        currentEmail,
        nextAction: typeof data.nextAction === "string" ? data.nextAction : undefined,
      };
    }

    return { error: "EMAIL_MISMATCH", message: "Invitation email mismatch." };
  }

  // Generic error fallback
  if (isObject(data) && typeof data.error === "string") {
    return {
      error: data.error,
      message: typeof data.message === "string" ? data.message : undefined,
    };
  }

  return { error: "UNKNOWN_RESPONSE", message: "Unexpected API response shape." };
}

export default function InviteClient() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { data: session, status: authStatus } = useSession();

  const token = useMemo(() => {
    const t = searchParams.get("token");
    return (t ?? "").trim();
  }, [searchParams]);

  const [result, setResult] = useState<AcceptResult>({ kind: "idle" });

  /**
   * If not authenticated, redirect to signin and come back here.
   */
  useEffect(() => {
    if (!token) return;

    if (authStatus === "unauthenticated") {
      const callbackUrl = `/invite?token=${encodeURIComponent(token)}`;
      router.replace(`/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`);
    }
  }, [authStatus, token, router]);

  async function acceptInvitation() {
    if (!token) {
      setResult({
        kind: "error",
        status: 400,
        data: { error: "MISSING_TOKEN", message: "Missing invitation token." },
      });
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
      const normalized = normalizeApiResponse(raw);

      // Route based on normalized shape
      if ("ok" in normalized && normalized.ok === true) {
        setResult({ kind: "ok", status: res.status, data: normalized });

        if (res.ok) {
          router.replace("/dashboard/member");
        }

        return;
      }

      if ("error" in normalized && normalized.error === "EMAIL_MISMATCH") {
        setResult({
          kind: "email_mismatch",
          status: res.status,
          data: normalized as ApiEmailMismatch,
        });
        return;
      }

      setResult({
        kind: "error",
        status: res.status,
        data: normalized as ApiGenericError,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "UNKNOWN_ERROR";

      setResult({
        kind: "error",
        status: 0,
        data: { error: "CLIENT_ERROR", message },
      });
    }
  }

  async function signOutAndContinue() {
    if (!token) return;

    const callbackUrl = `/invite?token=${encodeURIComponent(token)}`;
    await signOut({
      callbackUrl: `/signin?callbackUrl=${encodeURIComponent(callbackUrl)}`,
    });
  }

  /**
   * Auth resolution states
   */
  if (authStatus === "loading") {
    return (
      <main style={{ padding: 24 }}>
        <h1>Accept Invitation</h1>
        <p>Checking session…</p>
      </main>
    );
  }

  if (authStatus === "unauthenticated") {
    return (
      <main style={{ padding: 24 }}>
        <h1>Accept Invitation</h1>
        <p>Redirecting to sign in…</p>
      </main>
    );
  }

  const currentEmail = session?.user?.email ?? null;

  return (
    <main style={{ padding: 24, maxWidth: 560 }}>
      <h1>Accept Invitation</h1>

      {!token ? (
        <p style={{ marginTop: 12 }}>
          Invalid invitation link. Missing token.
        </p>
      ) : (
        <>
          <p style={{ marginTop: 12 }}>
            You were invited to join a workspace.
          </p>

          <button
            onClick={acceptInvitation}
            disabled={result.kind === "submitting"}
            style={{ marginTop: 16, padding: "8px 12px" }}
          >
            {result.kind === "submitting" ? "Accepting…" : "Accept Invitation"}
          </button>
        </>
      )}

      {result.kind === "email_mismatch" && (
        <div
          style={{
            marginTop: 20,
            border: "1px solid #ddd",
            padding: 12,
          }}
        >
          <p style={{ fontWeight: 600, margin: 0 }}>Wrong account</p>

          <p style={{ marginTop: 8 }}>
            You are signed in as:
            <br />
            <b>{result.data.currentEmail ?? currentEmail ?? "Unknown"}</b>
          </p>

          <p style={{ marginTop: 8 }}>
            This invitation is for:
            <br />
            <b>{result.data.expectedEmail}</b>
          </p>

          <button
            onClick={signOutAndContinue}
            style={{ marginTop: 12, padding: "8px 12px" }}
          >
            Sign out and continue
          </button>
        </div>
      )}

      {result.kind === "error" && (
        <pre
          style={{
            marginTop: 20,
            background: "#111",
            color: "#fff",
            padding: 12,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}

      {result.kind === "ok" && (
        <pre
          style={{
            marginTop: 20,
            background: "#111",
            color: "#fff",
            padding: 12,
            overflowX: "auto",
          }}
        >
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </main>
  );
}
