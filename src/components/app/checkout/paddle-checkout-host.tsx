"use client";

import { useEffect, useState, useCallback } from "react";
import Script from "next/script";
import { Spinner } from "@/components/ui/spinner";

const PADDLE_SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";

/** Paddle.js event payload (minimal shape we use). */
type PaddleEventData = { name: string };

declare global {
  interface Window {
    Paddle?: {
      Initialize: (config: {
        token: string;
        eventCallback?: (data: PaddleEventData) => void;
        checkout?: { settings?: Record<string, unknown> };
      }) => void;
    };
  }
}

/** Default redirect after successful checkout (workspace billing tab). */
const CHECKOUT_SUCCESS_REDIRECT = "/app/settings/workspace?tab=billing";

type Props = {
  /** Paddle client-side token (test_ or live_ from Paddle Dashboard > Developer tools > Authentication). */
  clientToken: string | null;
};

/**
 * Loads Paddle.js and initializes it so that when the user lands on this page with
 * ?_ptxn=txn_xxx (from Paddle's checkout.url), the checkout overlay opens automatically.
 * On checkout.completed, redirects to workspace billing tab.
 */
export function PaddleCheckoutHost({ clientToken }: Props) {
  const [scriptReady, setScriptReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const eventCallback = useCallback((data: PaddleEventData) => {
    if (data.name === "checkout.completed") {
      window.location.href = CHECKOUT_SUCCESS_REDIRECT;
    }
  }, []);

  useEffect(() => {
    if (!scriptReady || !clientToken || typeof window === "undefined") return;
    const Paddle = window.Paddle;
    if (!Paddle) {
      setInitError("Paddle.js failed to load.");
      return;
    }
    try {
      const token = clientToken.trim();
      Paddle.Initialize({
        token,
        eventCallback,
        checkout: {
          settings: {
            displayMode: "overlay",
            theme: "light",
            locale: "en",
          },
        },
      });
    } catch (e) {
      setInitError(e instanceof Error ? e.message : "Failed to initialize checkout.");
    }
  }, [scriptReady, clientToken, eventCallback]);

  if (!clientToken) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-(--text-primary)">
          Checkout is not configured
        </p>
        <p className="text-sm text-(--text-muted)">
          Set <code className="rounded bg-(--muted) px-1.5 py-0.5 text-xs">NEXT_PUBLIC_PADDLE_CLIENT_TOKEN</code> in your
          environment and set the Default Payment Link in Paddle Dashboard to this page.
        </p>
        <a
          href="/app/settings/workspace?tab=billing"
          className="text-sm text-(--color-primary) underline hover:no-underline"
        >
          Back to Billing
        </a>
      </div>
    );
  }

  if (initError) {
    return (
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-3 p-6 text-center">
        <p className="text-sm font-medium text-(--destructive)">{initError}</p>
        <a
          href="/app/settings/workspace?tab=billing"
          className="text-sm text-(--color-primary) underline hover:no-underline"
        >
          Back to Billing
        </a>
      </div>
    );
  }

  return (
    <>
      <Script
        src={PADDLE_SCRIPT_URL}
        strategy="afterInteractive"
        onLoad={() => setScriptReady(true)}
      />
      <div className="flex min-h-[40vh] flex-col items-center justify-center gap-4 p-6 text-center">
        <Spinner size="lg" />
        <p className="text-sm text-(--text-muted)">
          Preparing checkout…
        </p>
        <p className="text-xs text-(--text-muted)">
          If the checkout overlay does not open, you may have arrived without a transaction link.{" "}
          <a href="/app/settings/workspace?tab=billing" className="underline hover:no-underline">
            Go to Billing
          </a>{" "}
          to upgrade your plan.
        </p>
        <p className="text-xs text-(--text-muted)" aria-live="polite">
          {clientToken.startsWith("test_")
            ? "Using sandbox token (test_…)."
            : clientToken.startsWith("live_")
              ? "Using live token (live_…)."
              : "Check that your token starts with test_ (sandbox) or live_ (production)."}
        </p>
        <details className="text-left text-xs text-(--text-muted)">
          <summary className="cursor-pointer hover:underline">
            Getting &quot;Failed to retrieve JWT&quot; or &quot;Something went wrong&quot;?
          </summary>
          <p className="mt-2 font-medium text-(--text-primary)">
            Paddle does not support localhost for checkout (even with HTTPS). You must use a public URL.
          </p>
          <p className="mt-2">
            Use a tunnel (e.g. ngrok): run <code className="rounded bg-(--muted) px-1">ngrok http 3000</code> in a separate terminal, then in Paddle sandbox: (1) Checkout → Request website approval → add your <code className="rounded bg-(--muted) px-1">https://xxxx.ngrok-free.app</code> domain; (2) Checkout → Checkout settings → Default payment link = <code className="rounded bg-(--muted) px-1">https://xxxx.ngrok-free.app/checkout</code>. Open your app via the ngrok URL and try checkout again.
          </p>
        </details>
      </div>
    </>
  );
}
