"use client";

import { useEffect, useRef, useCallback } from "react";

const PING_INTERVAL_MS = 2 * 60 * 1000; // ping at most every 2 minutes
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

type UseActivityTrackerOptions = {
  enabled: boolean;
  autoLogoutMinutes: number | null;
};

export function useActivityTracker({ enabled, autoLogoutMinutes }: UseActivityTrackerOptions) {
  const lastPingRef = useRef<number>(Date.now());
  const hasActivityRef = useRef<boolean>(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const ping = useCallback(async () => {
    if (!hasActivityRef.current) return;
    hasActivityRef.current = false;

    try {
      const res = await fetch("/api/account/activity-ping", { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { data?: { expired?: boolean } };
      if (data?.data?.expired) {
        window.location.href = "/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired";
      }
    } catch {
      // Network error — ignore, don't logout on connectivity issues
    }
  }, []);

  const handleActivity = useCallback(() => {
    hasActivityRef.current = true;
    const now = Date.now();
    if (now - lastPingRef.current >= PING_INTERVAL_MS) {
      lastPingRef.current = now;
      void ping();
    }
  }, [ping]);

  useEffect(() => {
    if (!enabled || !autoLogoutMinutes) return;

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    intervalRef.current = setInterval(() => {
      void ping();
    }, 60 * 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, autoLogoutMinutes, handleActivity, ping]);
}
