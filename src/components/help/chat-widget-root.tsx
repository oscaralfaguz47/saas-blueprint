"use client";

import { usePathname } from "next/navigation";
import { ChatWidget } from "@/components/help/chat-widget";

/**
 * Renders the floating chat outside route layouts so `position: fixed` is not
 * affected by transformed ancestors (e.g. product shell).
 *
 * Hidden on platform admin routes (/admin/**).
 * Hidden on workspace-less paths where no tenantId is available — prevents
 * NO_TENANT errors when the user has no active workspace.
 */
export function ChatWidgetRoot({ hasTenant }: { hasTenant: boolean }) {
  const pathname = usePathname() ?? "";
  const isAdmin = pathname.startsWith("/admin");
  const forcedSurface = pathname.startsWith("/app") ? "app" : "public";

  // Do not render app-surface chat when user has no active workspace
  if (isAdmin) return null;
  if (forcedSurface === "app" && !hasTenant) return null;

  return <ChatWidget forcedSurface={forcedSurface} />;
}
