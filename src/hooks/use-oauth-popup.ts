"use client";

import { useCallback, useRef } from "react";

const POPUP_WIDTH = 500;
const POPUP_HEIGHT = 650;
const POPUP_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes

export type OAuthPopupResult =
  | { success: true }
  | {
      success: false;
      error: "popup_blocked" | "cancelled" | "timeout" | "error";
      errorCode?: string;
      provider?: string;
    };

export async function getOAuthAuthorizationUrl(
  provider: "google" | "azure-ad",
  callbackUrl: string
): Promise<string | null> {
  try {
    // Step 1: Get CSRF token from NextAuth
    const csrfRes = await fetch("/api/auth/csrf");
    const { csrfToken } = (await csrfRes.json()) as { csrfToken: string };

    // Step 2: POST to NextAuth signin endpoint to get the redirect URL
    const signinRes = await fetch(`/api/auth/signin/${provider}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        csrfToken,
        callbackUrl,
        json: "true",
      }),
      redirect: "manual",
    });

    // NextAuth returns the authorization URL in the response
    // When redirect: "manual", a redirect response has status 0 or 302
    // The URL is in the Location header or in the JSON body
    if (signinRes.type === "opaqueredirect") {
      // Can't read opaque redirect — use the JSON approach instead
      return null;
    }

    // Try JSON response first (json: "true" param)
    const contentType = signinRes.headers.get("content-type") ?? "";
    if (contentType.includes("application/json")) {
      const data = (await signinRes.json()) as { url?: string };
      if (data.url) return data.url;
    }

    // Try Location header
    const location = signinRes.headers.get("location");
    if (location) return location;

    return null;
  } catch {
    return null;
  }
}

function getPopupPosition() {
  const left = window.screenX + (window.outerWidth - POPUP_WIDTH) / 2;
  const top = window.screenY + (window.outerHeight - POPUP_HEIGHT) / 2;
  return { left: Math.round(left), top: Math.round(top) };
}

export function useOAuthPopup() {
  const popupRef = useRef<Window | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const openPopup = useCallback(
    (url: string): Promise<OAuthPopupResult> => {
      return new Promise((resolve) => {
        const { left, top } = getPopupPosition();
        const features = [
          `width=${POPUP_WIDTH}`,
          `height=${POPUP_HEIGHT}`,
          `left=${left}`,
          `top=${top}`,
          "scrollbars=yes",
          "resizable=yes",
          "status=no",
          "toolbar=no",
          "menubar=no",
          "location=no",
        ].join(",");

        const popup = window.open(url, "oauth_popup", features);

        if (!popup || popup.closed) {
          resolve({ success: false, error: "popup_blocked" });
          return;
        }

        popupRef.current = popup;

        // Listen for postMessage from the popup callback page
        function handleMessage(event: MessageEvent) {
          // Security: only accept messages from same origin
          if (event.origin !== window.location.origin) return;
          if (event.data?.type !== "OAUTH_POPUP_RESULT") return;

          cleanup();
          if (event.data.success) {
            resolve({ success: true });
          } else {
            resolve({
              success: false,
              error: "error",
              errorCode: event.data.error,
              provider: event.data.provider,
            });
          }
        }

        // Detect if user closes the popup manually
        const pollInterval = setInterval(() => {
          if (popup.closed) {
            cleanup();
            resolve({ success: false, error: "cancelled" });
          }
        }, 500);

        // Timeout safety net
        timeoutRef.current = setTimeout(() => {
          cleanup();
          resolve({ success: false, error: "timeout" });
        }, POPUP_TIMEOUT_MS);

        function cleanup() {
          window.removeEventListener("message", handleMessage);
          clearInterval(pollInterval);
          if (timeoutRef.current) clearTimeout(timeoutRef.current);
          if (popupRef.current && !popupRef.current.closed) {
            popupRef.current.close();
          }
          popupRef.current = null;
        }

        window.addEventListener("message", handleMessage);
      });
    },
    []
  );

  return { openPopup };
}
