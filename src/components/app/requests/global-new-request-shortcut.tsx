"use client";

import { useEffect, useState } from "react";
import { useCreateRequestModal } from "./create-request-modal-context";

/**
 * Mounts a global Cmd+K / Ctrl+K listener that opens the New Request modal.
 * Also shows a one-time dismissible hint tooltip near the New Request button.
 * Renders no visible UI after the hint is dismissed.
 */
export function GlobalNewRequestShortcut({
  workspaceCurrency,
}: {
  workspaceCurrency: string;
}) {
  const { openCreateRequestModal } = useCreateRequestModal();
  const [showHint, setShowHint] = useState(false);

  // Show hint once per browser (not per session)
  useEffect(() => {
    try {
      const dismissed = localStorage.getItem("rlt_cmdk_hint_dismissed");
      if (!dismissed) {
        // Delay slightly so it doesn't flash on initial load
        const t = setTimeout(() => setShowHint(true), 1800);
        return () => clearTimeout(t);
      }
    } catch {
      // localStorage not available (SSR guard — this component is client-only)
    }
  }, []);

  function dismissHint() {
    setShowHint(false);
    try {
      localStorage.setItem("rlt_cmdk_hint_dismissed", "1");
    } catch {
      // ignore
    }
  }

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        // Don't intercept if a dialog/modal is already open
        const hasOpenDialog = document.querySelector('[role="dialog"]');
        if (hasOpenDialog) return;
        e.preventDefault();
        dismissHint();
        openCreateRequestModal({ workspaceCurrency });
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [openCreateRequestModal, workspaceCurrency]);

  if (!showHint) return null;

  const isMac =
    typeof navigator !== "undefined" &&
    /Mac|iPhone|iPod|iPad/.test(navigator.platform);

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-6 right-6 z-50 animate-in fade-in slide-in-from-bottom-2 duration-300"
    >
      <div className="flex items-center gap-3 rounded-xl border border-(--border-subtle) bg-(--bg-surface) px-4 py-3 shadow-lg">
        <div className="flex items-center gap-2 text-sm text-(--text-secondary)">
          <span>Press</span>
          <kbd className="inline-flex items-center gap-0.5 rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 font-mono text-xs font-semibold text-(--text-primary)">
            {isMac ? "⌘" : "Ctrl"}
          </kbd>
          <kbd className="inline-flex items-center gap-0.5 rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-1.5 py-0.5 font-mono text-xs font-semibold text-(--text-primary)">
            K
          </kbd>
          <span>to create a request from anywhere</span>
        </div>
        <button
          type="button"
          onClick={dismissHint}
          aria-label="Dismiss shortcut hint"
          className="ml-1 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-full text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
        >
          ×
        </button>
      </div>
    </div>
  );
}
