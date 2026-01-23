"use client";

import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

type Status =
  | { type: "idle" }
  | { type: "sending_email" }
  | { type: "sending_google" }
  | { type: "email_sent"; email: string }
  | { type: "error"; message: string };

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
    return "This email was previously used with a different sign-in method. Please use the same method you used before (Google or Magic link).";
  }

  if (raw.includes("verification")) {
    return "This sign-in link is no longer valid. Please request a new one and try again.";
  }

  // NextAuth Email provider error codes
  if (raw.includes("emailsignin")) {
    return "We couldn’t send the magic link. Please confirm the email address and try again.";
  }

  if (raw.includes("accessdenied")) {
    return "Access denied. You do not have permission to sign in.";
  }

  return "We couldn’t sign you in. Please try again.";
}

function getSafeCallbackUrl(value: string | null) {
  // Keep same-origin relative paths only (prevents open-redirect)
  if (!value) return "/app/dashboard";
  return value.startsWith("/") ? value : "/app/dashboard";
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

export default function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => getSafeCallbackUrl(searchParams.get("callbackUrl")),
    [searchParams]
  );

  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>({ type: "idle" });

  const emailNormalized = normalizeEmail(email);
  const isBusy =
    status.type === "sending_email" || status.type === "sending_google";

  async function handleGoogle() {
    if (isBusy) return;

    setStatus({ type: "sending_google" });

    // NextAuth will redirect. If it doesn't (edge cases), we still reset state.
    try {
      await signIn("google", { callbackUrl });
    } catch (e: unknown) {
      setStatus({ type: "error", message: getFriendlyError(toErrorMessage(e)) });
    } finally {
      // If redirect happened, this won't matter; if it didn't, we recover UI.
      setTimeout(() => {
        setStatus((s) => (s.type === "sending_google" ? { type: "idle" } : s));
      }, 800);
    }
  }

  async function handleMagicLink(e: React.FormEvent) {
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

    try {
      const res = await signIn("email", {
        email: emailNormalized,
        callbackUrl,
        redirect: false, // IMPORTANT: lets us show an “Email sent” state
      });

      if (res?.error) {
        setStatus({ type: "error", message: getFriendlyError(res.error) });
        return;
      }

      setStatus({ type: "email_sent", email: emailNormalized });
    } catch (e: unknown) {
      setStatus({ type: "error", message: getFriendlyError(toErrorMessage(e)) });
    }
  }

  function reset() {
    setStatus({ type: "idle" });
  }

  const showInlineHint = status.type === "email_sent";
  const showInlineError = status.type === "error";

  return (
    <div className="space-y-4">
      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={isBusy}
        className="inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-semibold text-(--text-primary) transition-colors hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {status.type === "sending_google"
          ? "Signing in with Google..."
          : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-(--border-subtle)" />
        <div className="text-xs font-medium text-(--text-muted)">or</div>
        <div className="h-px flex-1 bg-(--border-subtle)" />
      </div>

      {/* Magic link */}
      <form onSubmit={handleMagicLink} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-(--text-secondary)">
            Email
          </span>

          <input
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status.type === "error" || status.type === "email_sent") {
                setStatus({ type: "idle" });
              }
            }}
            placeholder="you@company.com"
            type="email"
            autoComplete="email"
            disabled={isBusy}
            className={[
              "h-11 w-full rounded-lg border bg-(--bg-main) px-3 text-sm text-(--text-primary) outline-none transition-colors",
              "placeholder:text-(--text-muted)",
              "focus:border-(--color-primary) focus:ring-2 focus:ring-(--color-primary)",
              "disabled:cursor-not-allowed disabled:opacity-60",
              showInlineError ? "border-(--color-danger)" : "border-(--border-subtle)",
            ].join(" ")}
          />
        </label>

        <button
          type="submit"
          disabled={isBusy || !emailNormalized}
          className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.type === "sending_email"
            ? "Sending magic link..."
            : "Send magic link"}
        </button>
      </form>

      {/* Status box */}
      {status.type === "email_sent" && (
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 text-sm">
          <div className="font-semibold text-(--text-primary)">Check your email</div>
          <div className="mt-1 text-(--text-secondary)">
            We sent a sign-in link to{" "}
            <span className="font-mono text-(--text-primary)">{status.email}</span>. If you don’t see
            it, check Spam/Promotions.
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex text-xs font-medium text-(--text-secondary) hover:text-(--text-primary)"
          >
            Use a different email
          </button>
        </div>
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

      {/* Optional micro-hint under form when email sent */}
      {showInlineHint ? null : (
        <p className="text-center text-xs text-(--text-muted)">
          Tip: Use Google for faster sign-in, or request a magic link.
        </p>
      )}
    </div>
  );
}
