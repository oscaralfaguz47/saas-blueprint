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
      Environment?: { set: (env: "sandbox" | "production") => void };
      Initialize: (config: {
        token: string;
        eventCallback?: (data: PaddleEventData) => void;
        checkout?: { settings?: Record<string, unknown> };
      }) => void;
    };
  }
}

/** Redirect after successful checkout (EPIC 3: billing tab with refetch hint). */
const CHECKOUT_SUCCESS_REDIRECT =
  "/app/settings/workspace?tab=billing&billing=updated";
/** Redirect when user closes/cancels checkout (EPIC 3). */
const CHECKOUT_CANCELED_REDIRECT =
  "/app/settings/workspace?tab=billing&billing=canceled";

type Props = {
  /** Paddle client-side token (test_ or live_ from Paddle Dashboard > Developer tools > Authentication). */
  clientToken: string | null;
};

/**
 * Loads Paddle.js and initializes it so that when the user lands on this page with
 * ?_ptxn=txn_xxx (from Paddle's checkout.url), the checkout overlay opens automatically.
 * On checkout.completed, redirects to workspace billing tab.
 *
 * For sandbox (test_ token) we call Paddle.Environment.set("sandbox") before Initialize;
 * otherwise Paddle defaults to production and the sandbox token gets 403.
 * Initialize runs in the script's onLoad so the token is set before Paddle.js reads _ptxn.
 */
export function PaddleCheckoutHost({ clientToken }: Props) {
  const [scriptReady, setScriptReady] = useState(false);
  const [initError, setInitError] = useState<string | null>(null);

  const eventCallback = useCallback((data: PaddleEventData) => {
    if (data.name === "checkout.completed") {
      window.location.href = CHECKOUT_SUCCESS_REDIRECT;
    }
    // Paddle may fire checkout.closed when overlay is closed without completing
    if (data.name === "checkout.closed") {
      window.location.href = CHECKOUT_CANCELED_REDIRECT;
    }
  }, []);

  const handleScriptLoad = useCallback(() => {
    const Paddle = typeof window !== "undefined" ? window.Paddle : undefined;
    if (!Paddle) {
      setInitError("Paddle.js failed to load.");
      setScriptReady(true);
      return;
    }
    const token = clientToken?.trim();
    if (!token) {
      setInitError("Checkout is not configured. Set NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.");
      setScriptReady(true);
      return;
    }
    try {
      // Sandbox token must be used with sandbox environment; otherwise Paddle defaults to production and returns 403.
      if (token.startsWith("test_") && Paddle.Environment?.set) {
        Paddle.Environment.set("sandbox");
      }
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
      setScriptReady(true);
    } catch (e) {
      setInitError(e instanceof Error ? e.message : "Failed to initialize checkout.");
      setScriptReady(true);
    }
  }, [clientToken, eventCallback]);

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
        onLoad={handleScriptLoad}
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
            Paddle only allows checkout on approved domains. The domain of this page must be approved in Paddle and set as the Default payment link.
          </p>
          <ul className="mt-2 list-inside list-disc space-y-1">
            <li>
              <strong>Deployed app:</strong> Domain must be approved in Paddle and set as Default payment link. Use a <strong>sandbox</strong> client token (<code className="rounded bg-(--muted) px-1">test_</code>…) from the same Paddle sandbox account; check for typos (e.g. <code className="rounded bg-(--muted) px-1">saas</code> not <code className="rounded bg-(--muted) px-1">sass</code>). See <code className="rounded bg-(--muted) px-1">docs/PADDLE-DEPLOYMENT-CHECKLIST.md</code>.
            </li>
            <li>
              <strong>Local dev:</strong> Paddle does not support localhost. Use a tunnel (e.g. ngrok) and add that URL in Paddle; see <code className="rounded bg-(--muted) px-1">docs/PADDLE-LOCAL-CHECKOUT.md</code>.
            </li>
            <li>
              <strong>Verify config:</strong> Open <code className="rounded bg-(--muted) px-1">/api/billing/paddle/checkout-config</code> to confirm the app has a client token set and correct prefix (test_/live_).
            </li>
          </ul>
        </details>
      </div>
    </>
  );
}
