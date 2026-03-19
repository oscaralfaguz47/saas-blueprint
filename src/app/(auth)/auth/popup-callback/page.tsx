"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";

function PopupCallbackContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const error = searchParams.get("error");
    const success = !error;

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage(
        { type: "OAUTH_POPUP_RESULT", success },
        window.location.origin
      );
    }
    window.close();
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
