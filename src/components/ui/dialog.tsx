"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX } from "@/components/ui/icons";

type DialogProps = {
  open: boolean;
  onClose: () => void;
  /** Title (string or ReactNode for e.g. icon + text) */
  title: React.ReactNode;
  children: React.ReactNode;
  /**
   * Renders between the title row and the scrollable body (not scrolled).
   * Use for step indicators or secondary chrome that must stay visible.
   */
  headerExtra?: React.ReactNode;
  /** Optional description for a11y */
  description?: string;
  /** When true, Escape, overlay click, and X do not close the dialog */
  closeDisabled?: boolean;
  /** When false, clicking overlay does not close (e.g. confirm step). Default true. */
  allowOverlayClose?: boolean;
  /** Optional class for the content box (e.g. max-w-5xl for wide modals) */
  contentClassName?: string;
  /** Fixed footer rendered below the scrollable body */
  footer?: React.ReactNode;
};

export function Dialog({
  open,
  onClose,
  title,
  headerExtra,
  description,
  closeDisabled,
  allowOverlayClose = true,
  contentClassName,
  footer,
  children,
}: DialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [pointerDownOnOverlay, setPointerDownOnOverlay] = useState(false);
  const [showTopShadow, setShowTopShadow] = useState(false);
  const [showBottomShadow, setShowBottomShadow] = useState(false);
  const titleId = useRef<string>(`dialog-title-${Math.random().toString(36).slice(2, 9)}`).current;
  const descId = description ? `dialog-desc-${Math.random().toString(36).slice(2, 9)}` : undefined;
  const canCloseByEscOrX = !closeDisabled;
  const canCloseByOverlay = !closeDisabled && allowOverlayClose;

  const updateShadows = useCallback(() => {
    const el = bodyRef.current;
    if (!el) return;
    setShowTopShadow(el.scrollTop > 8);
    setShowBottomShadow(el.scrollHeight - el.scrollTop - el.clientHeight > 8);
  }, []);

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

  useEffect(() => {
    if (!open) return;
    updateShadows();
  }, [open, updateShadows]);

  if (!open) return null;

  const handleOverlayPointerDown = (e: React.PointerEvent) => {
    if (e.target === overlayRef.current) setPointerDownOnOverlay(true);
  };

  const handleOverlayPointerUp = (e: React.PointerEvent) => {
    if (e.target === overlayRef.current && pointerDownOnOverlay && canCloseByOverlay) {
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
      <div
        className="absolute inset-0 min-h-screen bg-black/50 backdrop-blur-sm"
        aria-hidden="true"
      />
      <div
        className={
          contentClassName
            ? `relative flex w-full flex-col rounded-2xl border border-(--border-subtle) bg-(--bg-surface) shadow-2xl max-h-[90dvh] ${contentClassName}`
            : "relative flex w-full max-w-md flex-col rounded-2xl border border-(--border-subtle) bg-(--bg-surface) shadow-2xl max-h-[90dvh]"
        }
        onPointerDown={handleContentPointerDown}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Fixed header */}
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
            className="shrink-0 cursor-pointer touch-manipulation rounded-lg p-2 text-(--text-muted) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:pointer-events-none disabled:opacity-50 sm:p-1.5"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>

        {/* Optional step indicator or extra header chrome */}
        {headerExtra ? (
          <div className="shrink-0 border-b border-(--border-subtle) bg-(--bg-surface) px-4 pb-3 pt-1 sm:px-6">
            {headerExtra}
          </div>
        ) : null}

        {/* Scrollable body */}
        <div
          ref={bodyRef}
          onScroll={updateShadows}
          className="min-h-0 flex-1 overflow-y-auto overscroll-contain scrollbar-dialog"
        >
          {/* Top scroll shadow — sticky inside scroll area */}
          <div
            aria-hidden
            className="pointer-events-none sticky top-0 left-0 right-0 z-10 -mb-5 h-5 transition-opacity duration-200"
            style={{
              background: "linear-gradient(to bottom, var(--bg-surface) 0%, transparent 100%)",
              opacity: showTopShadow ? 1 : 0,
            }}
          />

          {/* Actual content with padding */}
          <div className="p-4 sm:p-6">{children}</div>
        </div>

        {/* Bottom scroll shadow — rendered before footer */}
        {showBottomShadow && (
          <div
            aria-hidden
            className="pointer-events-none h-6 shrink-0 -mt-6 z-10"
            style={{
              background: "linear-gradient(to top, var(--bg-surface) 0%, transparent 100%)",
            }}
          />
        )}

        {/* Fixed footer (optional) */}
        {footer ? (
          <div className="shrink-0 border-t border-(--border-subtle) bg-(--bg-surface) px-4 py-3 sm:px-6 sm:py-4 rounded-b-2xl">
            {footer}
          </div>
        ) : null}
      </div>
    </div>
  );
}
