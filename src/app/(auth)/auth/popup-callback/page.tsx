"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export default function PopupCallbackPage() {
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
    // Close the popup after sending the message
    window.close();
  }, [searchParams]);

  return (
    <div className="flex h-screen items-center justify-center">
      <p className="text-sm text-gray-500">Completing sign-in...</p>
    </div>
  );
}
