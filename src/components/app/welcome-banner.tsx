"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function WelcomeBanner({ workspaceName }: { workspaceName: string }) {
  const router = useRouter();
  const [dismissed, setDismissed] = useState(false);
  const [hiding, setHiding] = useState(false);

  async function handleDismiss() {
    setHiding(true);
    try {
      await fetch("/api/account/dismiss-welcome-banner", { method: "POST" });
    } catch {
      // ignore
    }
    setTimeout(() => setDismissed(true), 300);
  }

  if (dismissed) return null;

  return (
    <div
      className={[
        "overflow-hidden transition-all duration-300 ease-in-out",
        hiding ? "max-h-0 opacity-0" : "max-h-24 opacity-100",
      ].join(" ")}
    >
      <div className="border-b border-(--border-subtle) bg-(--bg-surface-elev)">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <div className="min-w-0 flex items-center gap-3">
            <span className="shrink-0 text-base">🎉</span>
            <p className="truncate text-sm text-(--text-secondary)">
              Your workspace{" "}
              <span className="font-semibold text-(--text-primary)">{workspaceName}</span> was
              created automatically.{" "}
              <button
                type="button"
                onClick={() => router.push("/app/settings/workspace?tab=general")}
                className="font-medium text-primary hover:underline"
              >
                Rename it in Workspace settings →
              </button>
            </p>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            aria-label="Dismiss"
            className="shrink-0 rounded-md p-1 text-(--text-muted) transition-colors hover:bg-(--bg-surface) hover:text-(--text-primary)"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              viewBox="0 0 24 24"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
