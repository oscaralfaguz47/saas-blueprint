"use client";
import { useEffect, useRef, useCallback } from "react";

const PING_INTERVAL_MS = 2 * 60 * 1000; // activity ping: every 2 min
const VALIDITY_CHECK_MS = 30 * 1000; // session validity: every 30s
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];

type UseActivityTrackerOptions = {
  enabled: boolean;
  autoLogoutMinutes: number | null;
};

export function useActivityTracker({ enabled, autoLogoutMinutes }: UseActivityTrackerOptions) {
  const lastPingRef = useRef<number>(Date.now());
  const hasActivityRef = useRef<boolean>(false);
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const validityIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Session validity check — always runs, checks for force-logout/revocation
  const checkValidity = useCallback(async () => {
    try {
      const res = await fetch("/api/account/activity-ping", { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { data?: { expired?: boolean } };
      if (data?.data?.expired) {
        window.location.href = "/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired";
      }
    } catch {
      // Network error — ignore
    }
  }, []);

  // Activity ping — only runs when auto-logout is enabled
  const ping = useCallback(async () => {
    if (!hasActivityRef.current) return;
    hasActivityRef.current = false;
    await checkValidity();
  }, [checkValidity]);

  const handleActivity = useCallback(() => {
    hasActivityRef.current = true;
    const now = Date.now();
    if (now - lastPingRef.current >= PING_INTERVAL_MS) {
      lastPingRef.current = now;
      void ping();
    }
  }, [ping]);

  // Always-on: session validity check every 30 seconds
  useEffect(() => {
    // Background interval is slower — reduces requests when tab is not visible
    // but never stops entirely (session revocation must still be detected)
    const BACKGROUND_CHECK_MS = 5 * 60 * 1000; // 5 minutes when hidden

    function stopInterval() {
      if (validityIntervalRef.current) {
        clearInterval(validityIntervalRef.current);
        validityIntervalRef.current = null;
      }
    }

    function startInterval(ms: number) {
      stopInterval();
      validityIntervalRef.current = setInterval(() => {
        void checkValidity();
      }, ms);
    }

    // Start with the appropriate interval based on current visibility
    if (document.visibilityState === "visible") {
      startInterval(VALIDITY_CHECK_MS);
    } else {
      startInterval(BACKGROUND_CHECK_MS);
    }

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        // Tab became visible — check immediately then switch to fast interval
        void checkValidity();
        startInterval(VALIDITY_CHECK_MS);
      } else {
        // Tab went to background — switch to slow interval
        startInterval(BACKGROUND_CHECK_MS);
      }
    };

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      stopInterval();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [checkValidity]);

  // Auto-logout activity tracking — only when enabled
  useEffect(() => {
    if (!enabled || !autoLogoutMinutes) return;

    ACTIVITY_EVENTS.forEach((event) => {
      window.addEventListener(event, handleActivity, { passive: true });
    });

    pingIntervalRef.current = setInterval(() => {
      void ping();
    }, 60 * 1000);

    return () => {
      ACTIVITY_EVENTS.forEach((event) => {
        window.removeEventListener(event, handleActivity);
      });
      if (pingIntervalRef.current) clearInterval(pingIntervalRef.current);
    };
  }, [enabled, autoLogoutMinutes, handleActivity, ping]);
}
