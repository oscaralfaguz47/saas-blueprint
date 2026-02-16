"use client";

import { useCallback } from "react";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/api-client";

export type ApiFetchOptions = RequestInit & {
  /** When true (default), show an error toast on non-ok response. Set false for silent failures (e.g. background refetch). */
  showToastOnError?: boolean;
};

/**
 * Returns a fetch-like function that shows an error toast on non-ok responses.
 * Use for all /api/* requests so errors are surfaced consistently.
 * Must be used within ToastProvider.
 */
export function useApiFetch() {
  const toast = useToast();

  const apiFetch = useCallback(
    async (url: RequestInfo | URL, init?: ApiFetchOptions): Promise<Response> => {
      const { showToastOnError = true, ...fetchInit } = init ?? {};
      const res = await fetch(url, fetchInit);

      if (!res.ok) {
        // 401: session expired or invalid — redirect to our sign-out page with reason so UI shows "session expired" and auto sign-out clears cookie (NextAuth GET does not pass callbackUrl to the page).
        if (res.status === 401) {
          window.location.href = "/auth/sign-out?callbackUrl=/auth/sign-in&reason=session_expired";
          return res;
        }
        if (showToastOnError) {
          try {
            const clone = res.clone();
            const data = (await clone.json().catch(() => ({}))) as {
              error?: string;
              message?: string;
              details?: { code?: string };
            };
            // Skip toast for validation and rate-limit errors; they are shown inline in the form.
            if (
              res.status === 400 ||
              res.status === 429 ||
              data.error === "VALIDATION_ERROR" ||
              data.error === "RATE_LIMITED"
            )
              return res;
            toast.addToast("error", getApiErrorMessage(res, data));
          } catch {
            toast.addToast("error", "Something went wrong. Please try again.");
          }
        }
      }

      return res;
    },
    [toast]
  );

  return apiFetch;
}
