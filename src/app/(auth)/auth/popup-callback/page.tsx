"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function PopupCallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    const success = !error;

    const sendAndClose = () => {
      if (window.opener && !window.opener.closed) {
        try {
          window.opener.postMessage(
            { type: "OAUTH_POPUP_RESULT", success },
            window.location.origin
          );
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
      <p className="text-sm text-gray-500">Completing sign-in...</p>
    </div>
  );
}

export default function PopupCallbackPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen items-center justify-center">
          <p className="text-sm text-gray-500">Completing sign-in...</p>
        </div>
      }
    >
      <PopupCallbackContent />
    </Suspense>
  );
}
