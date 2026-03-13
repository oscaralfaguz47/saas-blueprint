"use client";

import { useState } from "react";
import Link from "next/link";
import { Input } from "@/components/ui/input";

const REMEMBER_DAYS_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "60", label: "60 days" },
  { value: "90", label: "90 days" },
] as const;

type Props = { hasBackupCodes?: boolean };

export function TwoFaChallengeForm({ hasBackupCodes = true }: Props) {
  const [code, setCode] = useState("");
  const [rememberDevice, setRememberDevice] = useState(false);
  const [rememberDays, setRememberDays] = useState<"30" | "60" | "90">("30");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cancelLoading, setCancelLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = code.trim();
    if (!trimmed) {
      setError("Enter your 6-digit code or backup code.");
      return;
    }
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          code: trimmed,
          rememberDevice: rememberDevice || undefined,
          rememberDays: rememberDevice ? rememberDays : undefined,
        }),
      });
      const json = (await res.json()) as {
        data?: { verified?: boolean };
        error?: string | {
          code?: string;
          message?: string;
          details?: { code?: string };
        };
        message?: string;
        details?: { code?: string };
      };
      if (!res.ok) {
        const errorObj = typeof json.error === "object" && json.error !== null ? json.error : null;
        const errDetailsCode = errorObj?.details?.code || json.details?.code;
        const errMessage = errorObj?.message || (typeof json.error === "string" ? json.error : json.message);

        const msg =
          errDetailsCode === "MFA_CHALLENGE_EXPIRED"
            ? "This sign-in attempt expired. Please sign in again."
            : errMessage || "Invalid code. Try again.";
        setError(msg);
        setLoading(false);
        return;
      }
      window.location.href = "/app";
    } catch {
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  }

  async function onSignOut() {
    setCancelLoading(true);
    try {
      const res = await fetch("/api/auth/2fa/cancel", { method: "POST" });
      const json = (await res.json()) as { data?: { ok?: boolean }; error?: string };
      if (res.ok && json.data?.ok) {
        window.location.href = "/auth/sign-in";
        return;
      }
      setError("Could not sign out. Try again.");
    } catch {
      setError("Could not sign out. Try again.");
    } finally {
      setCancelLoading(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={onSubmit} className="space-y-4">
        <div>
          <label htmlFor="code" className="sr-only">
            Authentication code
          </label>
          <Input
            id="code"
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="000000 or backup code"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="text-center text-lg tracking-widest"
            maxLength={10}
            disabled={loading}
          />
        </div>
        {hasBackupCodes && (
          <p className="text-sm text-(--text-secondary)">
            <Link
              href="#"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("code")?.focus();
              }}
              className="underline hover:text-(--color-primary)"
            >
              Use a backup code
            </Link>
          </p>
        )}
        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm text-(--text-secondary)">
            <input
              type="checkbox"
              checked={rememberDevice}
              onChange={(e) => setRememberDevice(e.target.checked)}
              disabled={loading}
              className="rounded border-(--border-subtle)"
            />
            Remember this device
          </label>
          {rememberDevice && (
            <select
              value={rememberDays}
              onChange={(e) => setRememberDays(e.target.value as "30" | "60" | "90")}
              disabled={loading}
              className="rounded-lg border border-(--border-subtle) bg-(--bg-main) px-3 py-2 text-sm text-(--text-primary)"
              aria-label="Remember duration"
            >
              {REMEMBER_DAYS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>
        {error ? (
          <p className="text-sm text-(--color-danger)" role="alert">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={loading}
          className="w-full inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
        >
          {loading ? "Verifying…" : "Verify"}
        </button>
      </form>
      <div className="border-t border-(--border-subtle) pt-4">
        <p className="text-sm text-(--text-muted) mb-2">
          Lost access to your authenticator? You can sign out and try another account.
        </p>
        <button
          type="button"
          onClick={onSignOut}
          disabled={cancelLoading}
          className="text-sm font-medium text-(--text-secondary) hover:text-(--text-primary) underline disabled:opacity-60"
        >
          {cancelLoading ? "Signing out…" : "Sign out"}
        </button>
      </div>
    </div>
  );
}
