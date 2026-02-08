"use client";

import { useEffect, useRef } from "react";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  /** Optional description for a11y */
  description?: string;
  /** When true, Escape and overlay click do not close the dialog */
  closeDisabled?: boolean;
};

export function Dialog({ open, onClose, title, description, closeDisabled, children }: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const titleId = useRef<string>(`dialog-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descId = description ? `dialog-desc-${Math.random().toString(36).slice(2, 9)}` : undefined;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !closeDisabled) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, closeDisabled]);

  if (!open) return null;

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === overlayRef.current && !closeDisabled) onClose();
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={handleOverlayClick}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        className="relative w-full max-w-md rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-b border-(--border-subtle) px-6 py-4">
          <h2 id={titleId} className="text-lg font-semibold text-(--text-primary)">
            {title}
          </h2>
          {description ? (
            <p id={descId} className="mt-1 text-sm text-(--text-muted)">
              {description}
            </p>
          ) : null}
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
