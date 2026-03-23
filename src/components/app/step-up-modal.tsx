"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  /** Whether the current user has 2FA enabled */
  hasTwoFactor: boolean;
  /** User's email for display */
  email?: string | null;
  /** Optional human-readable label for the action being confirmed.
   *  Used to give context in the modal description, e.g. "revoke all sessions". */
  actionLabel?: string | null;
};

export function StepUpModal({
  open,
  onClose,
  onSuccess,
  hasTwoFactor,
  email,
  actionLabel,
}: Props) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [codeSent, setCodeSent] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [isRestored, setIsRestored] = useState(false);
  const persistedCooldown = useRef<number>(0);
  const persistedCodeSent = useRef<boolean>(false);

  const sendCode = useCallback(async () => {
    setSendingCode(true);
    setError(null);
    try {
      const res = await fetch("/api/auth/step-up/send-code", { method: "POST" });
      const data = (await res.json()) as {
        error?: { message?: string; details?: { retryAfterSec?: number } };
      };
      if (!res.ok) {
        const retryAfter = data.error?.details?.retryAfterSec;
        if (typeof retryAfter === "number" && retryAfter > 0) setCooldown(retryAfter);
        setError(data.error?.message ?? "Failed to send code.");
        return;
      }
      setCodeSent(true);
      setCooldown(60);
    } catch {
      setError("Something went wrong.");
    } finally {
      setSendingCode(false);
    }
  }, []);

  useEffect(() => {
    if (!open) {
      persistedCooldown.current = cooldown;
      persistedCodeSent.current = codeSent;
      return;
    }

    setCode("");
    setError(null);
    setLoading(false);
    if (!hasTwoFactor) {
      const remainingCooldown = persistedCooldown.current;
      const alreadySent = persistedCodeSent.current;

      if (alreadySent && remainingCooldown > 0) {
        setCodeSent(true);
        setCooldown(remainingCooldown);
        setIsRestored(true);
      } else if (alreadySent && remainingCooldown === 0) {
        setCodeSent(true);
        setCooldown(0);
        setIsRestored(false);
      } else {
        setCodeSent(false);
        setCooldown(0);
        setIsRestored(false);
        void sendCode();
      }
    } else {
      setCodeSent(false);
      setCooldown(0);
      setIsRestored(false);
      persistedCooldown.current = 0;
      persistedCodeSent.current = false;
    }
  }, [open, hasTwoFactor, sendCode]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((c) => {
        const next = Math.max(0, c - 1);
        persistedCooldown.current = next;
        return next;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  useEffect(() => {
    persistedCodeSent.current = codeSent;
  }, [codeSent]);

  const submitCode = useCallback(
    async (trimmed: string) => {
      if (!trimmed || loading) return;
      setError(null);
      setLoading(true);
      try {
        const res = await fetch("/api/auth/step-up/verify", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ code: trimmed }),
        });
        const data = (await res.json()) as {
          data?: { verified?: boolean };
          error?: { message?: string };
        };
        if (!res.ok) {
          setError(data.error?.message ?? "Invalid code. Please try again.");
          setCode("");
          setLoading(false);
          return;
        }
        setLoading(false);
        onSuccess();
      } catch {
        setError("Something went wrong.");
        setLoading(false);
      }
    },
    [loading, onSuccess],
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await submitCode(code.trim());
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Confirm your identity"
      description={
        hasTwoFactor
          ? actionLabel
            ? `To ${actionLabel}, enter your authenticator code or a backup code.`
            : "Enter your authenticator code or a backup code to continue."
          : codeSent
            ? `We sent a verification code to ${email ?? "your email"}. Enter it below to continue.`
            : "We'll send a verification code to your email to confirm your identity."
      }
      closeDisabled={loading}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {!hasTwoFactor && !codeSent && (
          <div className="flex justify-center py-2">
            {sendingCode ? (
              <div className="flex items-center gap-2 text-sm text-(--text-muted)">
                <Spinner size="sm" />
                Sending code...
              </div>
            ) : (
              <button
                type="button"
                onClick={() => void sendCode()}
                disabled={sendingCode || cooldown > 0}
                className="text-sm font-medium text-(--color-primary) hover:underline disabled:opacity-60"
              >
                Send verification code
              </button>
            )}
          </div>
        )}

        {(hasTwoFactor || codeSent) && (
          <div>
            {!hasTwoFactor && isRestored && codeSent && cooldown > 0 && (
              <p className="mb-2 rounded-lg bg-(--bg-surface-elev) px-3 py-2 text-xs text-(--text-secondary)">
                A code was already sent to {email ?? "your email"}. You can request a new one in{" "}
                {cooldown}s.
              </p>
            )}
            <label className="mb-1 block text-xs font-medium text-(--text-secondary)">
              {hasTwoFactor ? "Authenticator code or backup code" : "Verification code"}
            </label>
            {hasTwoFactor ? (
              <input
                type="text"
                inputMode="text"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                onChange={(e) => {
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8);
                  setCode(v);
                  setError(null);
                }}
                placeholder="000000 or backup code"
                maxLength={8}
                disabled={loading}
                className={[
                  "h-11 w-full rounded-lg border bg-(--bg-main) px-3 text-center text-lg font-mono font-semibold text-(--text-primary) outline-none transition-colors tracking-widest",
                  "placeholder:text-(--text-muted) placeholder:tracking-normal placeholder:font-sans placeholder:text-sm",
                  "focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  error ? "border-(--color-danger)" : "border-(--border-subtle)",
                ].join(" ")}
              />
            ) : (
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                value={code}
                maxLength={6}
                disabled={loading}
                onChange={(e) => {
                  const v = e.target.value.replace(/\D/g, "").slice(0, 6);
                  setCode(v);
                  setError(null);
                  if (v.length === 6 && !loading) {
                    setTimeout(() => {
                      const form = e.target.closest("form");
                      if (form) form.requestSubmit();
                    }, 300);
                  }
                }}
                placeholder="— — — — — —"
                className={[
                  "h-12 w-full rounded-lg border bg-(--bg-main) px-4 text-center text-2xl font-mono font-semibold text-(--text-primary) outline-none transition-colors tracking-[0.5em]",
                  "placeholder:text-(--text-muted) placeholder:tracking-[0.4em] placeholder:text-xl",
                  "focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)",
                  "disabled:cursor-not-allowed disabled:opacity-60",
                  error ? "border-(--color-danger)" : "border-(--border-subtle)",
                ].join(" ")}
              />
            )}
            {error && (
              <p className="mt-1 text-sm text-(--color-danger)" role="alert">
                {error}
              </p>
            )}
            {!hasTwoFactor && codeSent && (
              <p className="mt-1 text-xs text-(--text-muted)">
                Didn&apos;t receive it?{" "}
                {cooldown > 0 ? (
                  <span>Resend in {cooldown}s</span>
                ) : (
                  <button
                    type="button"
                    onClick={() => void sendCode()}
                    disabled={sendingCode}
                    className="font-medium text-(--color-primary) hover:underline disabled:opacity-60"
                  >
                    {sendingCode ? "Sending..." : "Resend code"}
                  </button>
                )}
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            Cancel
          </button>
          {(hasTwoFactor || codeSent) && (
            <button
              type="submit"
              disabled={loading || code.trim().length < 6}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Spinner size="sm" className="text-white" />
                  Verifying...
                </>
              ) : (
                "Confirm"
              )}
            </button>
          )}
        </div>
      </form>
    </Dialog>
  );
}
