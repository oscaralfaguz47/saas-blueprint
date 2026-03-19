"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { getCsrfToken } from "next-auth/react";
import { Spinner } from "@/components/ui/spinner";

type SignOutFormProps = {
  callbackUrl: string;
  buttonLabel: string;
  sessionExpired?: boolean;
};

// Calls NextAuth's signout endpoint via fetch to clear session cookies,
// then redirects the browser to the target URL ourselves.
// We never rely on NextAuth's redirect response because NextAuth v4 builds
// the Location header from the server-side Host header, which is
// localhost:3000 when running behind ngrok — ignoring NEXTAUTH_URL.
async function performSignOut(csrfToken: string, redirectTo: string) {
  try {
    localStorage.removeItem("atl.theme.app");
    document.documentElement.setAttribute("data-theme", "dark");
  } catch {
    // ignore
  }
  try {
    await fetch("/api/auth/signout", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ csrfToken, callbackUrl: redirectTo }),
      redirect: "manual", // do not follow NextAuth's redirect
    });
  } catch {
    // Even if the fetch fails, clear cookies best-effort and redirect.
  }
  // Always redirect to the correct URL regardless of fetch outcome.
  window.location.href = redirectTo;
}

export default function SignOutForm({
  callbackUrl,
  buttonLabel,
  sessionExpired = false,
}: SignOutFormProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const autoSignOutDone = useRef(false);

  useEffect(() => {
    getCsrfToken().then((token) => setCsrfToken(token ?? null));
  }, []);

  // Session expired: auto sign-out as soon as CSRF token is available.
  useEffect(() => {
    if (!sessionExpired || autoSignOutDone.current) return;
    if (!csrfToken) return;
    autoSignOutDone.current = true;

    const basePath = callbackUrl.includes("?")
      ? callbackUrl.split("?")[0]!
      : callbackUrl;
    const target = `${basePath}?error=SessionExpired`;
    void performSignOut(csrfToken, target);
  }, [sessionExpired, callbackUrl, csrfToken]);

  if (sessionExpired) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 py-2">
        <Spinner size="md" />
        <p className="text-sm text-(--color-fg-secondary)">
          Redirecting you to sign in…
        </p>
      </div>
    );
  }

  if (!csrfToken) {
    return (
      <div className="flex justify-center py-4">
        <Spinner size="md" />
      </div>
    );
  }

  async function handleSignOut(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || !csrfToken) return;
    setBusy(true);
    await performSignOut(csrfToken, callbackUrl);
  }

  return (
    <form onSubmit={handleSignOut} className="mt-6">
      <button
        type="submit"
        disabled={busy}
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
      >
        {busy ? <Spinner size="sm" /> : buttonLabel}
      </button>
    </form>
  );
}
