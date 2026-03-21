"use client";

import { useSession } from "next-auth/react";
import { useActivityTracker } from "@/hooks/use-activity-tracker";

/**
 * Always mounted: `useActivityTracker` runs periodic session validity checks (30s)
 * regardless of auto-logout settings. Activity-based pings for idle timeout only
 * run when auto-logout is enabled.
 */
export function ActivityTrackerProvider() {
  const { data: session } = useSession();

  const autoLogoutEnabled = session?.user?.autoLogoutEnabled ?? false;
  const autoLogoutMinutes = autoLogoutEnabled
    ? (session?.user?.autoLogoutMinutes ?? null)
    : null;

  useActivityTracker({
    enabled: autoLogoutEnabled,
    autoLogoutMinutes,
  });

  return null;
}
