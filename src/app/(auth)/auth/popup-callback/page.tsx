"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function buildOAuthPopupResultMessage(searchParams: URLSearchParams) {
  const error = searchParams.get("error");
  const provider = searchParams.get("provider");
  const success = !error;

  return {
    type: "OAUTH_POPUP_RESULT" as const,
    success,
    error: error ?? undefined,
    provider: provider ?? undefined,
  };
}

function PopupCallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const message = buildOAuthPopupResultMessage(searchParams);

    const sendAndClose = () => {
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(message, window.location.origin);
        } catch {
          // opener may be cross-origin in some edge cases, ignore
        }
      }
      // Delay close to give parent event loop time to process the message
      setTimeout(() => window.close(), 300);
    };

    // Small defer to ensure React has hydrated and opener is accessible
    const timer = setTimeout(sendAndClose, 50);
    return () => clearTimeout(timer);
  }, [searchParams]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-sm text-(--text-muted)">Completing sign-in...</p>
    </div>
  );
}

export default function PopupCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p className="text-sm text-(--text-muted)">Completing sign-in...</p>
        </div>
      }
    >
      <PopupCallbackContent />
    </Suspense>
  );
}
