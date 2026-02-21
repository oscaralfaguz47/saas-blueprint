"use client";

import { useEffect, useRef, useState } from "react";
import { IconX } from "@/components/ui/icons";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
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
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onPointerDown={handleOverlayPointerDown}
      onPointerUp={handleOverlayPointerUp}
      onPointerLeave={() => setPointerDownOnOverlay(false)}
    >
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" aria-hidden="true" />
      <div
        className={
          contentClassName
            ? `relative w-full rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl ${contentClassName}`
            : "relative w-full max-w-md rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl"
        }
        onPointerDown={handleContentPointerDown}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4 border-b border-(--border-subtle) px-6 py-4">
          <div className="min-w-0">
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
            className="shrink-0 rounded-md p-1.5 text-(--text-muted) hover:bg-(--bg-surface-elev) hover:text-(--text-primary) disabled:pointer-events-none disabled:opacity-50"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
