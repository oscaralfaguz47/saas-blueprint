"use client";

import * as React from "react";
import { createPortal } from "react-dom";

type HoverCardContextValue = {
  open: boolean;
  setOpen: (open: boolean) => void;
  triggerRef: React.RefObject<HTMLSpanElement | null>;
};

const HoverCardContext = React.createContext<HoverCardContextValue | null>(null);

function useHoverCard() {
  const ctx = React.useContext(HoverCardContext);
  if (!ctx) throw new Error("HoverCard components must be used within HoverCard.");
  return ctx;
}

export type HoverCardProps = {
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
};

export function HoverCard({ children, open: controlledOpen, onOpenChange }: HoverCardProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = React.useState(false);
  const triggerRef = React.useRef<HTMLSpanElement | null>(null);
  const isControlled = controlledOpen !== undefined;
  const open = isControlled ? controlledOpen : uncontrolledOpen;
  const setOpen = React.useCallback(
    (next: boolean) => {
      if (!isControlled) setUncontrolledOpen(next);
      onOpenChange?.(next);
    },
    [isControlled, onOpenChange],
  );
  return (
    <HoverCardContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block">{children}</div>
    </HoverCardContext.Provider>
  );
}

export type HoverCardTriggerProps = {
  children: React.ReactNode;
  asChild?: boolean;
  className?: string;
};

export function HoverCardTrigger({ children, className = "" }: HoverCardTriggerProps) {
  const { setOpen, triggerRef } = useHoverCard();
  return (
    <span
      ref={triggerRef}
      role="button"
      tabIndex={0}
      className={"inline-flex cursor-help " + className}
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onFocus={() => setOpen(true)}
      onBlur={() => setOpen(false)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
    </span>
  );
}

export type HoverCardContentProps = {
  children: React.ReactNode;
  className?: string;
  side?: "top" | "right" | "bottom" | "left";
};

export function HoverCardContent({
  children,
  className = "",
  side = "bottom",
}: HoverCardContentProps) {
  const { open, triggerRef } = useHoverCard();
  const [style, setStyle] = React.useState<React.CSSProperties>({ opacity: 0 });

  React.useEffect(() => {
    if (!open || typeof document === "undefined") return;
    const el = triggerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const W = 256;
    const gap = 8;
    const padding = 8;
    const maxLeft = document.documentElement.clientWidth - W - padding;
    const minLeft = padding;
    const centerLeft = rect.left + rect.width / 2 - W / 2;
    const clampedLeft = Math.min(maxLeft, Math.max(minLeft, centerLeft));

    if (side === "top") {
      setStyle({
        position: "fixed",
        bottom: document.documentElement.clientHeight - rect.top + gap,
        left: clampedLeft,
        width: W,
        zIndex: 9999,
      });
    } else if (side === "bottom") {
      setStyle({
        position: "fixed",
        top: rect.bottom + gap,
        left: clampedLeft,
        width: W,
        zIndex: 9999,
      });
    } else if (side === "left") {
      setStyle({
        position: "fixed",
        top: rect.top + rect.height / 2,
        left: rect.left - W - gap,
        width: W,
        zIndex: 9999,
      });
    } else {
      setStyle({
        position: "fixed",
        top: rect.top + rect.height / 2,
        left: rect.right + gap,
        width: W,
        zIndex: 9999,
      });
    }
  }, [open, side, triggerRef]);

  if (!open) return null;

  const content = (
    <div
      role="tooltip"
      className={
        "rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3 text-sm text-(--text-primary) shadow-lg " +
        (side === "top" ? "origin-bottom" : side === "bottom" ? "origin-top" : "") +
        " " +
        className
      }
      style={style}
    >
      {children}
    </div>
  );

  if (typeof document !== "undefined") {
    return createPortal(content, document.body);
  }
  return content;
}
