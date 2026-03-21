"use client";

import { useEffect } from "react";
import { useSearchParams } from "next/navigation";

export function OAuthPopupDetector() {
  const searchParams = useSearchParams();

  useEffect(() => {
    // Do not run on popup-callback — that page handles postMessage itself
    if (window.location.pathname === "/auth/popup-callback") return;

    if (!window.opener || window.opener.closed) return;

    const error = searchParams.get("error");
    const provider = searchParams.get("provider");
    const success = !error;

    window.opener.postMessage(
      {
        type: "OAUTH_POPUP_RESULT",
        success,
        error: error ?? undefined,
        provider: provider ?? undefined,
      },
      window.location.origin
    );
    setTimeout(() => window.close(), 150);
  }, [searchParams]);

  return null;
}
