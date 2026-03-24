"use client";

import { usePathname } from "next/navigation";

import { ChatWidget } from "@/components/help/chat-widget";

/**
 * Renders the floating chat outside route layouts so `position: fixed` is not
 * affected by transformed ancestors (e.g. product shell). Hidden on platform admin.
 */
export function ChatWidgetRoot() {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname.startsWith("/admin");
  const forcedSurface = pathname.startsWith("/app") ? "app" : "public";
  if (process.env.NODE_ENV === "development") {
    console.log("[chat-widget-root] rendering", { pathname, isAdmin, forcedSurface });
  }
  if (isAdmin) return null;
  return <ChatWidget forcedSurface={forcedSurface} />;
}
