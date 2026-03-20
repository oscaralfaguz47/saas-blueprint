"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useOAuthPopup, getOAuthAuthorizationUrl } from "@/hooks/use-oauth-popup";
import { authenticateWithPasskey } from "@/hooks/use-passkey";

type Status =
  | { type: "idle" }
  | { type: "sending_email" }
  | { type: "code_sent"; email: string }
  | { type: "verifying_code" }
  | { type: "sending_google" }
  | { type: "sending_microsoft" }
  | { type: "sending_passkey" }
  | { type: "error"; message: string; provider?: "passkey" };

function normalizeEmail(input: string) {
  return input.trim().toLowerCase();
}

function isValidEmail(email: string) {
  // Simple, safe UI validation (not full RFC). Prevents obvious invalid input.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function toErrorMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e);
  } catch {
    return "Unknown error";
  }
}

function getFriendlyError(messageOrCode?: string) {
  const raw = (messageOrCode ?? "").toLowerCase();

  if (raw.includes("oauthaccountnotlinked")) {
    return "This email was previously used with a different sign-in method. Please use the same method you used before (Google, Microsoft, or Magic Link).";
  }
  if (raw.includes("microsoftemailrequired")) {
    return "Your Microsoft account did not provide a usable email address. Please use a Microsoft work account with an addressable email, or sign in with Magic Link.";
  }
  if (raw.includes("verification")) {
    return "This sign-in link is no longer valid. Please request a new one and try again.";
  }

  if (raw.includes("emailsignin")) {
    return "We couldn’t send the magic link. Please confirm the email address and try again.";
  }

  if (raw.includes("accessdenied")) {
    return "Sign-in could not be completed. If you were trying to link your Microsoft account, please try again.";
  }

  return "We couldn’t sign you in. Please try again.";
}

function getSafeCallbackUrl(value: string | null) {
  // Keep same-origin relative paths only (prevents open-redirect)
  if (!value) return "/app/requests";
  return value.startsWith("/") ? value : "/app/requests";
}

function GoogleIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 48 48"
      className="h-5 w-5"
      focusable="false"
    >
      <path
        fill="#EA4335"
        d="M24 9.5c3.5 0 6.6 1.2 9 3.3l6.7-6.7C35.6 2.3 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.3l7.8 6.1C12.3 13.3 17.7 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.1 24.5c0-1.6-.1-2.8-.4-4.1H24v7.8h12.6c-.3 2-1.7 5-4.8 7.1l7.4 5.8c4.3-4 6.9-9.9 6.9-16.6z"
      />
      <path
        fill="#FBBC05"
        d="M10.4 28.6c-.5-1.4-.8-2.8-.8-4.6s.3-3.2.8-4.6l-7.8-6.1C1 16.6 0 20.2 0 24s1 7.4 2.6 10.7l7.8-6.1z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.2 0 11.4-2 15.2-5.5l-7.4-5.8c-2 1.4-4.7 2.4-7.8 2.4-6.3 0-11.7-3.8-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
      />
      <path fill="none" d="M0 0h48v48H0z" />
    </svg>
  );
}

function MicrosoftIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 21 21"
      className="h-5 w-5"
      focusable="false"
    >
      <rect x="1" y="1" width="9" height="9" fill="#F25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
      <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
      <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
    </svg>
  );
}

function PasskeyIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-3.5 w-3.5"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <circle cx="8" cy="7" r="4" />
      <path d="M16 15v-1a4 4 0 0 0-4-4H4a4 4 0 0 0-4 4v2" />
      <line x1="19" y1="8" x2="19" y2="14" />
      <line x1="22" y1="11" x2="16" y2="11" />
    </svg>
  );
}

function ResendCodeButton({
  email,
  callbackUrl,
  disabled: disabledProp,
  initialCooldown = 0,
  onResent,
}: {
  email: string;
  callbackUrl: string;
  disabled?: boolean;
  initialCooldown?: number;
  onResent: () => void;
}) {
  const [cooldown, setCooldown] = useState(initialCooldown);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  async function handleResend() {
    if (disabledProp || sending || cooldown > 0) return;
    setSending(true);
    try {
      const res = await fetch("/api/auth/email-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json().catch(() => ({} as unknown)) as {
        data?: { sent: boolean };
        error?: { message?: string; details?: { retryAfterSec?: number } };
      };

      if (!res.ok) {
        const retryAfter = data.error?.details?.retryAfterSec;
        if (retryAfter && retryAfter > 0) {
          // Server told us exact cooldown — use it
          setCooldown(retryAfter);
        } else {
          // Generic error — show 60s cooldown as safety net
          setCooldown(60);
        }
        return;
      }

      // Success — apply 60s cooldown and notify parent
      setCooldown(60);
      if (data.data?.sent === true) onResent();
    } catch {
      // Network error — brief cooldown then allow retry
      setCooldown(10);
    } finally {
      setSending(false);
    }
  }

  return (
    <p className="text-center text-xs text-(--text-muted)">
      {cooldown > 0 ? (
        <>
          Didn&apos;t receive it?{" "}
          <span className="text-(--text-primary)">Resend in {cooldown}s</span>
        </>
      ) : (
        <>
          Didn&apos;t receive it?{" "}
          <button
            type="button"
            onClick={handleResend}
            disabled={sending}
            className="font-medium text-(--text-primary) hover:underline disabled:opacity-60"
          >
            {sending ? "Sending..." : "Resend code"}
          </button>
        </>
      )}
    </p>
  );
}

export default function SignInForm() {
  const searchParams = useSearchParams();
  const { openPopup } = useOAuthPopup();
  const callbackUrl = useMemo(
    () => getSafeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });
  const [otpCode, setOtpCode] = useState("");
  const [otpError, setOtpError] = useState<string | null>(null);

  const emailNormalized = normalizeEmail(email);
  const isBusy =
    status.type === "sending_email" ||
    status.type === "sending_google" ||
    status.type === "sending_microsoft" ||
    status.type === "verifying_code";

  async function handleGoogle() {
    if (isBusy) return;

    setStatus({ type: "sending_google" });

    try {
      const popupCallbackUrl = `${window.location.origin}/auth/popup-callback`;
      const authUrl = await getOAuthAuthorizationUrl("google", popupCallbackUrl);

      if (!authUrl) {
        await signIn("google", { callbackUrl });
        return;
      }

      const result = await openPopup(authUrl);

      if (result.success) {
        window.location.href = callbackUrl;
        return;
      }
      if (result.error === "popup_blocked") {
        await signIn("google", { callbackUrl });
        return;
      }
      if (result.error === "cancelled") {
        setStatus({ type: "idle" });
        return;
      }
      setStatus({ type: "error", message: getFriendlyError(undefined) });
    } catch (e: unknown) {
      setStatus({ type: "error", message: getFriendlyError(toErrorMessage(e)) });
    }
  }

  async function handleMicrosoft() {
    if (isBusy) return;
    setStatus({ type: "sending_microsoft" });
    try {
      const popupCallbackUrl = `${window.location.origin}/auth/popup-callback`;
      const authUrl = await getOAuthAuthorizationUrl("azure-ad", popupCallbackUrl);

      if (!authUrl) {
        await signIn("azure-ad", { callbackUrl });
        return;
      }

      const result = await openPopup(authUrl);

      if (result.success) {
        window.location.href = callbackUrl;
        return;
      }
      if (result.error === "popup_blocked") {
        await signIn("azure-ad", { callbackUrl });
        return;
      }
      if (result.error === "cancelled") {
        setStatus({ type: "idle" });
        return;
      }
      setStatus({ type: "error", message: getFriendlyError(undefined) });
    } catch (e: unknown) {
      setStatus({ type: "error", message: getFriendlyError(toErrorMessage(e)) });
    }
  }

  async function handlePasskey() {
    if (isBusy) return;
    setStatus({ type: "sending_passkey" });
    setTimeout(() => {
      setStatus((prev) =>
        prev.type === "sending_passkey" ? { type: "idle" } : prev
      );
    }, 3000);
    try {
      const result = await authenticateWithPasskey();
      if (!result.success) {
        if (result.error === "cancelled") {
          setStatus({ type: "idle" });
          return;
        }
        if (result.error === "not_supported") {
          setStatus({
            type: "error",
            provider: "passkey",
            message: "Passkeys are not supported on this device or browser.",
          });
          return;
        }
        setStatus({ type: "error", provider: "passkey", message: result.message });
        return;
      }
      const res = await signIn("passkey-credential", {
        passkeyToken: result.passkeyToken,
        callbackUrl,
        redirect: false,
      });
      if (res?.error) {
        setStatus({
          type: "error",
          provider: "passkey",
          message: "Sign-in failed. Please try again.",
        });
        return;
      }
      window.location.href = res?.url ?? callbackUrl;
    } catch {
      setStatus({ type: "idle" });
    }
  }

  async function handleEmailContinue(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy) return;

    if (!emailNormalized) {
      setStatus({ type: "error", message: "Please enter your email address." });
      return;
    }

    // Client-side format validation (prevents confusing server/provider errors)
    if (!isValidEmail(emailNormalized)) {
      setStatus({ type: "error", message: "Please enter a valid email address." });
      return;
    }

    setStatus({ type: "sending_email" });
    setOtpError(null);

    try {
      const res = await fetch("/api/auth/email-otp/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: emailNormalized, callbackUrl }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus({
          type: "error",
          message: data?.error?.message ?? "Failed to send code. Please try again.",
        });
        return;
      }

      setStatus({ type: "code_sent", email: emailNormalized });
    } catch (e: unknown) {
      setStatus({ type: "error", message: getFriendlyError(toErrorMessage(e)) });
    }
  }

  function reset() {
    setStatus({ type: "idle" });
    setOtpCode("");
    setOtpError(null);
  }

  // Only apply email field error styling when error is from email/magic link flow, not passkey
  const showInlineError = status.type === "error" && status.provider !== "passkey";

  async function handleVerifyCode(e: React.FormEvent) {
    e.preventDefault();
    if (status.type !== "code_sent") return;

    const code = otpCode.trim();
    if (!/^\d{6}$/.test(code)) {
      setOtpError("Please enter the 6-digit code.");
      return;
    }

    setStatus({ type: "verifying_code" });
    setOtpError(null);

    try {
      const res = await fetch("/api/auth/email-otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: status.email, code }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const message =
          data?.error?.message ?? "Invalid code. Please check and try again.";
        setOtpError(message);
        setStatus({ type: "code_sent", email: status.email });
        return;
      }

      const sessionToken = data?.data?.sessionToken as string | undefined;
      if (!sessionToken) {
        setStatus({ type: "error", message: "Verification failed. Please try again." });
        return;
      }

      const signInRes = await signIn("email-otp-credential", {
        otpToken: sessionToken,
        callbackUrl,
        redirect: false,
      });

      if (signInRes?.error) {
        setStatus({
          type: "error",
          message: "Sign-in failed. Please try again.",
        });
        return;
      }

      window.location.href = signInRes?.url ?? callbackUrl;
    } catch (e: unknown) {
      setStatus({ type: "error", message: getFriendlyError(toErrorMessage(e)) });
    }
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mt-2 text-sm text-(--text-secondary)">
          No password required —{" "}
          <span className="text-(--text-muted)">
            new accounts are created automatically.
          </span>
        </p>
      </div>

      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={isBusy}
        aria-label="Continue with Google"
        className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {status.type === "sending_google"
          ? "Signing in with Google..."
          : "Continue with Google"}
      </button>

      {/* Microsoft */}
      <button
        type="button"
        onClick={handleMicrosoft}
        disabled={isBusy}
        aria-label="Continue with Microsoft"
        className="inline-flex h-12 w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <MicrosoftIcon />
        {status.type === "sending_microsoft"
          ? "Signing in with Microsoft..."
          : "Continue with Microsoft"}
      </button>

      {/* Divider */}
      <div className="flex items-center gap-3 text-xs text-(--text-muted)">
        <div className="h-px flex-1 bg-(--border-subtle)" />
        <span className="font-medium">or continue with email</span>
        <div className="h-px flex-1 bg-(--border-subtle)" />
      </div>

      {/* Step 1: Email */}
      {(status.type === "idle" ||
        status.type === "sending_email" ||
        status.type === "sending_passkey" ||
        status.type === "error") && (
        <form onSubmit={handleEmailContinue} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-(--text-secondary)">
              Work or personal email
            </span>

            <input
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (status.type === "error") setStatus({ type: "idle" });
              }}
              placeholder="you@company.com"
              type="email"
              autoComplete="email"
              disabled={isBusy}
              className={[
                "h-11 w-full rounded-lg border bg-(--bg-main) px-3 text-sm text-(--text-primary) outline-none transition-colors",
                "placeholder:text-(--text-muted)",
                "focus:border-primary focus:ring-2 focus:ring-primary",
                "disabled:cursor-not-allowed disabled:opacity-60",
                showInlineError ? "border-(--color-danger)" : "border-(--border-subtle)",
              ].join(" ")}
            />
          </label>

          <button
            type="submit"
            disabled={isBusy || !emailNormalized}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.type === "sending_email" ? "Sending code..." : "Continue"}
          </button>

          <div className="pt-1 flex items-center justify-center">
            <button
              type="button"
              onClick={handlePasskey}
              disabled={isBusy}
              className="flex items-center gap-1.5 text-xs text-(--text-muted) hover:text-(--text-primary) transition-colors disabled:opacity-40"
            >
              <PasskeyIcon />
              {status.type === "sending_passkey"
                ? "Signing in with passkey..."
                : "Sign in with a passkey instead"}
            </button>
          </div>
        </form>
      )}

      {/* Step 2: OTP code */}
      {(status.type === "code_sent" || status.type === "verifying_code") && (
        <form onSubmit={handleVerifyCode} className="space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-(--text-secondary)">
                Verification code
              </span>
              <button
                type="button"
                onClick={() => {
                  setStatus({ type: "idle" });
                  setOtpCode("");
                  setOtpError(null);
                  setEmail("");
                }}
                className="text-xs text-(--text-muted) hover:text-(--text-primary)"
              >
                ← Change email
              </button>
            </div>

            <p className="mb-2 text-xs text-(--text-muted)">
              We sent a verification code and a sign-in link to{" "}
              <span className="font-medium text-(--text-primary)">{email}</span>.
              Enter the code below or click the link in your email.
            </p>

            <input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={6}
              value={otpCode}
              disabled={status.type === "verifying_code"}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 6);
                setOtpCode(val);
                if (otpError) setOtpError(null);
                if (val.length === 6) {
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
                "focus:border-primary focus:ring-2 focus:ring-primary",
                "disabled:cursor-not-allowed disabled:opacity-60",
                otpError ? "border-(--color-danger)" : "border-(--border-subtle)",
              ].join(" ")}
            />

            {otpError && <p className="mt-1 text-xs text-(--color-danger)">{otpError}</p>}
          </div>

          <button
            type="submit"
            disabled={status.type === "verifying_code" || otpCode.length !== 6}
            className="inline-flex h-11 w-full cursor-pointer items-center justify-center rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-hover disabled:cursor-not-allowed disabled:opacity-60"
          >
            {status.type === "verifying_code" ? "Verifying..." : "Verify code"}
          </button>

          <ResendCodeButton
            email={status.type === "code_sent" ? status.email : emailNormalized}
            callbackUrl={callbackUrl}
            disabled={status.type === "verifying_code"}
            initialCooldown={60}
            onResent={() => {
              setOtpCode("");
              setOtpError(null);
            }}
          />
        </form>
      )}

      {status.type === "error" && (
        <div className="rounded-xl border border-(--color-danger) bg-(--bg-surface) px-4 py-3 text-sm">
          <div className="font-semibold text-(--text-primary)">Sign-in error</div>
          <div className="mt-1 text-(--text-secondary)">{status.message}</div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex text-xs font-medium text-(--text-secondary) hover:text-(--text-primary)"
          >
            Dismiss
          </button>
        </div>
      )}

    </div>
  );
}
