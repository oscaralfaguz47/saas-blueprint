"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@/components/ui/icons";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Title (string or ReactNode for e.g. icon + text) */
  title: React.ReactNode;
  children: React.ReactNode;
  /** Optional description for a11y */
  description?: string;
  /** When true, Escape, overlay click, and X do not close the dialog */
  closeDisabled?: boolean;
  /** When false, clicking overlay does not close (e.g. confirm step). Default true. */
  allowOverlayClose?: boolean;
  /** Optional class for the content box (e.g. max-w-5xl for wide modals) */
  contentClassName?: string;
};

export function Dialog({
  open,
  onClose,
  title,
  description,
  closeDisabled,
  allowOverlayClose = true,
  contentClassName,
  children,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const [pointerDownOnOverlay, setPointerDownOnOverlay] = useState(false);
  const titleId = useRef<string>(`dialog-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descId = description ? `dialog-desc-${Math.random().toString(36).slice(2, 9)}` : undefined;
  const canCloseByEscOrX = !closeDisabled;
  const canCloseByOverlay = !closeDisabled && allowOverlayClose;

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && canCloseByEscOrX) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose, canCloseByEscOrX]);

  if (!open) return null;

  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    if (e.target === overlayRef.current) setPointerDownOnOverlay(true);
  };

  const handleOverlayPointerUp = (e: React.PointerEvent) => {
    if (
      e.target === overlayRef.current &&
      pointerDownOnOverlay &&
      canCloseByOverlay
    ) {
      onClose();
    }
    setPointerDownOnOverlay(false);
  };

  const handleContentPointerDown = () => {
    setPointerDownOnOverlay(false);
  };

  return (
    <div
      ref={overlayRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descId}
      className="fixed inset-0 z-50 flex min-h-dvh min-h-screen items-center justify-center p-3 sm:p-4"
      onPointerDown={handleOverlayPointerDown}
      onPointerUp={handleOverlayPointerUp}
      onPointerLeave={() => setPointerDownOnOverlay(false)}
    >
      <div className="absolute inset-0 min-h-dvh min-h-screen bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        className={
          contentClassName
            ? `relative flex max-h-[90vh] w-full flex-col rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl sm:max-h-[85dvh] ${contentClassName}`
            : "relative flex max-h-[90vh] w-full max-w-md flex-col rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl sm:max-h-[85dvh]"
        }
        onPointerDown={handleContentPointerDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-start justify-between gap-3 border-b border-(--border-subtle) px-4 py-3 sm:gap-4 sm:px-6 sm:py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="text-base font-semibold text-(--text-primary)">
              {title}
            </h2>
            {description ? (
              <p id={descId} className="mt-1 text-sm text-(--text-muted)">
                {description}
              </p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={canCloseByEscOrX ? onClose : undefined}
            disabled={!canCloseByEscOrX}
            className="shrink-0 rounded-md p-2 text-(--text-muted) hover:bg-(--bg-surface-elev) hover:text-(--text-primary) disabled:pointer-events-none disabled:opacity-50 touch-manipulation sm:p-1.5"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {children}
        </div>
      </div>
    </div>
  );
}
