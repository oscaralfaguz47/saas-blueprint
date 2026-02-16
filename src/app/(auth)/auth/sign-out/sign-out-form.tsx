"use client";

import { useEffect, useRef, useState } from "react";
import { getCsrfToken, signOut } from "next-auth/react";
import { Spinner } from "@/components/ui/spinner";

type SignOutFormProps = {
  callbackUrl: string;
  buttonLabel: string;
  /** When true, session expired — clear session and redirect to sign-in without requiring a click. */
  sessionExpired?: boolean;
};

export default function SignOutForm({
  callbackUrl,
  buttonLabel,
  sessionExpired = false,
}: SignOutFormProps) {
  const [csrfToken, setCsrfToken] = useState<string | null>(null);
  const autoSignOutDone = useRef(false);

  useEffect(() => {
    getCsrfToken().then((token) => setCsrfToken(token ?? null));
  }, []);

  // When session expired, clear session and redirect to sign-in with error=SessionExpired so the sign-in page shows "session expired" message.
  useEffect(() => {
    if (!sessionExpired || autoSignOutDone.current) return;
    autoSignOutDone.current = true;
    const basePath = callbackUrl.includes("?") ? callbackUrl.split("?")[0]! : callbackUrl;
    const signInWithReason = `${basePath}?error=SessionExpired`;
    void signOut({ callbackUrl: signInWithReason });
  }, [sessionExpired, callbackUrl]);

  if (sessionExpired) {
    return (
      <div className="mt-6 flex flex-col items-center gap-3 py-2">
        <Spinner size="md" />
        <p className="text-sm text-(--color-fg-secondary)">Redirecting you to sign in…</p>
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

  return (
    <form action="/api/auth/signout" method="POST" className="mt-6">
      <input type="hidden" name="csrfToken" value={csrfToken} />
      <input type="hidden" name="callbackUrl" value={callbackUrl} />
      <button
        type="submit"
        className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-semibold text-white transition-colors hover:bg-(--color-primary-hover)"
      >
        {buttonLabel}
      </button>
    </form>
  );
}
