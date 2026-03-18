"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";

const COOLDOWN_SECONDS = 60;

type Status =
  | { type: "idle" }
  | { type: "sending" }
  | { type: "sent" }
  | { type: "error"; message: string };

type Props = { challengeToken: string };

export default function LinkAccountForm({ challengeToken }: Props) {
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [cooldownLeft, setCooldownLeft] = useState(0);
  const sentOnce = useRef(false);

  useEffect(() => {
    if (sentOnce.current) return;
    sentOnce.current = true;
    sendEmail();
  }, []);

  useEffect(() => {
    if (cooldownLeft <= 0) return;
    const t = setInterval(() => setCooldownLeft((n) => (n <= 1 ? 0 : n - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldownLeft]);

  async function sendEmail() {
    setStatus({ type: "sending" });
    try {
      const res = await fetch("/api/link/send-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token: challengeToken }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({ type: "error", message: (data as { error?: string }).error ?? "Failed to send email." });
        return;
      }
      setStatus({ type: "sent" });
      setCooldownLeft(COOLDOWN_SECONDS);
    } catch {
      setStatus({ type: "error", message: "Failed to send email. Please try again." });
    }
  }

  const isBusy = status.type === "sending";
  const canResend = status.type === "sent" && cooldownLeft === 0;

  return (
    <div className="space-y-4">
      {status.type === "sent" && (
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm">
          <div className="font-semibold text-(--text-primary)">Check your email</div>
          <div className="mt-1 text-(--text-secondary)">
            We sent a sign-in link to your email. Click it to confirm and link your Microsoft account.
            If you don&apos;t see it, check Spam/Promotions.
          </div>
          <button
            type="button"
            onClick={() => sendEmail()}
            disabled={!canResend || isBusy}
            className="mt-3 inline-flex text-xs font-medium text-(--text-secondary) hover:text-(--text-primary) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {canResend ? "Resend link" : `Resend in ${cooldownLeft}s`}
          </button>
        </div>
      )}

      {status.type === "error" && (
        <div className="rounded-xl border border-(--color-danger) bg-(--bg-surface) px-4 py-3 text-sm">
          <div className="font-semibold text-(--text-primary)">Error</div>
          <div className="mt-1 text-(--text-secondary)">{status.message}</div>
        </div>
      )}

      {status.type === "sending" && (
        <p className="text-sm text-(--text-secondary)">Sending magic link...</p>
      )}

      <p className="text-center text-xs text-(--text-muted)">
        <Link
          href="/auth/sign-in"
          className="text-(--text-secondary) hover:text-(--text-primary)"
        >
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
