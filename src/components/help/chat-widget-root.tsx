"use client";

import { usePathname } from "next/navigation";

import { ChatWidget } from "@/components/help/chat-widget";

/**
 * Renders the floating chat outside route layouts so `position: fixed` is not
 * affected by transformed ancestors (e.g. product shell).
 *
 * Hidden visually on platform admin routes (/admin/**) but kept mounted to
 * avoid stale pathname issues during navigation transitions in Next.js App Router.
 * Using display:none instead of conditional unmounting preserves the mounted
 * state across /admin <-> /app navigations.
 */
export function ChatWidgetRoot() {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname.startsWith("/admin");
  const forcedSurface = pathname.startsWith("/app") ? "app" : "public";

  return (
    <div style={isAdmin ? { display: "none" } : undefined}>
      <ChatWidget forcedSurface={forcedSurface} />
    </div>
  );
}
