"use client";

import { useEffect } from "react";
import { ButtonLink } from "@/components/ui/button";

/**
 * Error boundary for the app segment (per ui-ux-contract: error state for user-facing screens).
 * Catches runtime errors and shows a generic message without leaking details.
 */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log server-side only; do not expose to client
    console.error("App error boundary:", error?.message ?? error);
  }, [error]);

  const buttonBase =
    "inline-flex h-11 items-center justify-center rounded-lg px-4 text-sm font-medium transition-colors";

  return (
    <div className="flex min-h-[40vh] flex-col items-center justify-center gap-6 px-4 py-12">
      <h1 className="text-lg font-semibold text-(--text-primary)">
        Something went wrong
      </h1>
      <p className="max-w-sm text-center text-sm text-(--text-muted)">
        We couldn’t complete your request. Please try again or return to the home
        page.
      </p>
      <div className="flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className={`${buttonBase} border border-(--border-strong) bg-(--bg-surface) text-(--text-primary) shadow-sm hover:bg-(--bg-surface-hover)`}
        >
          Try again
        </button>
        <ButtonLink href="/app" variant="primary">
          Go to home
        </ButtonLink>
      </div>
    </div>
  );
}
