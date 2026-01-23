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

export default function SignInForm() {
  const searchParams = useSearchParams();
  const callbackUrl = useMemo(
    () => searchParams.get("callbackUrl") ?? "/app",
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

      // NextAuth Email provider usually returns { ok: true } even if email is not delivered,
      // but if it fails, we’ll get an error code.
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

  return (
    <div className="space-y-4">
      {/* Google */}
      <button
        type="button"
        onClick={handleGoogle}
        disabled={isBusy}
        className="w-full rounded-xl border border-black/10 bg-white px-4 py-2.5 text-sm font-medium shadow-sm hover:bg-black/[0.03] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {status.type === "sending_google"
          ? "Signing in with Google..."
          : "Continue with Google"}
      </button>

      <div className="flex items-center gap-3">
        <div className="h-px flex-1 bg-black/10" />
        <div className="text-xs text-black/45">or</div>
        <div className="h-px flex-1 bg-black/10" />
      </div>

      {/* Magic link */}
      <form onSubmit={handleMagicLink} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-black/60">
            Email
          </span>
          <input
            required
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              if (status.type === "error" || status.type === "email_sent") {
                // Clear messages as user edits
                setStatus({ type: "idle" });
              }
            }}
            placeholder="you@company.com"
            type="email"
            autoComplete="email"
            disabled={isBusy}
            className="w-full rounded-xl border border-black/10 bg-white px-3 py-2.5 text-sm outline-none ring-0 placeholder:text-black/35 focus:border-black/20 disabled:cursor-not-allowed disabled:opacity-60"
          />
        </label>

        <button
          type="submit"
          disabled={isBusy || !emailNormalized}
          className="w-full rounded-xl bg-black px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-black/90 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {status.type === "sending_email"
            ? "Sending magic link..."
            : "Send magic link"}
        </button>
      </form>

      {/* Status box */}
      {status.type === "email_sent" && (
        <div className="rounded-xl border border-black/10 bg-black/[0.02] px-4 py-3 text-sm">
          <div className="font-medium">Check your email</div>
          <div className="mt-1 text-black/60">
            We sent a sign-in link to{" "}
            <span className="font-mono">{status.email}</span>. If you don’t see
            it, check Spam/Promotions.
          </div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex text-xs font-medium text-black/70 hover:text-black"
          >
            Use a different email
          </button>
        </div>
      )}

      {status.type === "error" && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm">
          <div className="font-medium text-red-900">Sign-in error</div>
          <div className="mt-1 text-red-800">{status.message}</div>
          <button
            type="button"
            onClick={reset}
            className="mt-3 inline-flex text-xs font-medium text-red-900/80 hover:text-red-900"
          >
            Dismiss
          </button>
        </div>
      )}
    </div>
  );
}
