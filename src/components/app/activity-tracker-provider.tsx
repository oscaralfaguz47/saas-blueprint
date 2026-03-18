"use client";

import { useSession } from "next-auth/react";
import { useActivityTracker } from "@/hooks/use-activity-tracker";

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
