"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { IconHelpCircle, IconX } from "@/components/ui/icons";

const PADDLE_INLINE_FRAME_TARGET = "paddle-inline-container";
const PADDLE_FRAME_INITIAL_HEIGHT = "600";
/** Paddle inline frame: min-width per docs (312px with padding). Order summary is our left column. */
const PADDLE_FRAME_STYLE =
  "width: 100%; min-width: 312px; background-color: transparent; border: none;";

export type OrderSummaryItem = {
  productName: string;
  subscriptionLabel: string;
  priceNow: string;
  priceRecurring: string;
  subtotal: string;
  vat: string;
  dueToday: string;
  dueOnDate: string;
  quantity: number;
};

/** Paddle checkout event payload (checkout.loaded, checkout.customer.updated). Totals are strings in cents. */
export type PaddleCheckoutEventData = {
  name?: string;
  data?: {
    totals?: { subtotal?: string; tax?: string; total?: string; currency_code?: string };
    recurring_totals?: { total?: string };
    items?: Array<{
      quantity?: number;
      product?: { name?: string };
      price_name?: string;
    }>;
    currency_code?: string;
  };
};

/** Format Paddle amount (string cents) to display e.g. "$59.00" or "$12.34". */
function formatCents(centsStr: string | undefined): string {
  if (centsStr === undefined || centsStr === "") return "$0.00";
  const cents = Number.parseInt(centsStr, 10);
  if (Number.isNaN(cents)) return "$0.00";
  return `$${(cents / 100).toFixed(2)}`;
}

/**
 * Build OrderSummaryItem from Paddle event data, merging with initial summary for static fields.
 */
function orderSummaryFromPaddleData(
  data: PaddleCheckoutEventData,
  initial: OrderSummaryItem | null | undefined,
): OrderSummaryItem | null {
  const payload = data?.data;
  const totals = payload?.totals;
  const recurring = payload?.recurring_totals;
  const items = payload?.items;
  if (!totals) return initial ?? null;

  const subtotal = formatCents(totals.subtotal);
  const vat = formatCents(totals.tax);
  const dueToday = formatCents(totals.total);
  const priceNow = dueToday;
  const priceRecurring = recurring?.total
    ? `then ${formatCents(recurring.total)} monthly`
    : initial?.priceRecurring ?? "—";
  const firstItem = items?.[0];
  const productName = firstItem?.product?.name ?? initial?.productName ?? "Workspace Subscription";
  const subscriptionLabel = firstItem?.price_name ?? initial?.subscriptionLabel ?? "Subscription";
  const quantity = firstItem?.quantity ?? initial?.quantity ?? 1;

  return {
    productName,
    subscriptionLabel,
    priceNow,
    priceRecurring,
    subtotal,
    vat,
    dueToday,
    dueOnDate: initial?.dueOnDate ?? "",
    quantity,
  };
}

type Props = {
  open: boolean;
  transactionId: string | null;
  /** When provided (e.g. upgrade), show full Order Summary in left column; when null, show compact fallback. */
  orderSummary?: OrderSummaryItem | null;
  /** Ref the parent sets to forward Paddle checkout events (checkout.loaded, checkout.customer.updated) so we can refresh VAT/subtotal. */
  forwardTotalsRef?: React.MutableRefObject<((data: PaddleCheckoutEventData) => void) | null>;
  onClose: () => void;
};

declare global {
  interface Window {
    Paddle?: {
      Checkout?: {
        open: (opts: {
          transactionId: string;
          settings?: Record<string, string | boolean>;
        }) => void;
      };
    };
  }
}

/**
 * Modal that shows Paddle checkout in inline mode with our own Order Summary.
 * Left column = Order summary (full when orderSummary provided, compact fallback otherwise).
 * Right column = Paddle checkout iframe. We control the backdrop; Paddle content is opaque.
 */
export function PaddleCheckoutInlineModal({
  open,
  transactionId,
  orderSummary,
  forwardTotalsRef,
  onClose,
}: Props) {
  const openedRef = useRef(false);
  /** When set, overrides orderSummary so VAT/subtotal stay in sync with Paddle when country changes. */
  const [liveSummary, setLiveSummary] = useState<OrderSummaryItem | null>(null);

  useEffect(() => {
    if (!forwardTotalsRef) return;
    const handler = (data: PaddleCheckoutEventData) => {
      const next = orderSummaryFromPaddleData(data, orderSummary);
      if (next) setLiveSummary(next);
    };
    forwardTotalsRef.current = handler;
    return () => {
      forwardTotalsRef.current = null;
    };
  }, [forwardTotalsRef, orderSummary]);

  useEffect(() => {
    if (!open) setLiveSummary(null);
  }, [open]);

  const displaySummary = liveSummary ?? orderSummary;

  useEffect(() => {
    if (!open || !transactionId || typeof document === "undefined") return;
    const Paddle = window.Paddle;
    if (!Paddle?.Checkout?.open) return;
    if (openedRef.current) return;
    const run = () => {
      const container = document.querySelector(`.${PADDLE_INLINE_FRAME_TARGET}`);
      if (!container) return;
      if (openedRef.current) return;
      openedRef.current = true;
      Paddle.Checkout.open({
        transactionId,
        settings: {
          displayMode: "inline",
          frameTarget: PADDLE_INLINE_FRAME_TARGET,
          frameInitialHeight: PADDLE_FRAME_INITIAL_HEIGHT,
          frameStyle: PADDLE_FRAME_STYLE,
          theme: "light",
          locale: "en",
          showAddTaxId: true,
          variant: "one-page",
        },
      });
    };
    const t = requestAnimationFrame(() => run());
    return () => {
      cancelAnimationFrame(t);
      openedRef.current = false;
    };
  }, [open, transactionId]);

  useEffect(() => {
    if (!open) openedRef.current = false;
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open || typeof document === "undefined") return null;

  const content = (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Checkout"
      className="fixed inset-0 z-100 flex min-h-screen items-center justify-center p-3 sm:p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      <div
        className="dialog-overlay absolute inset-0 min-h-screen"
        aria-hidden="true"
      />
      <div className="relative flex max-h-[90dvh] w-full max-w-5xl flex-col rounded-xl border border-(--border-subtle) bg-(--bg-surface) shadow-xl sm:max-h-[85dvh]">
        <div className="flex shrink-0 items-center justify-end border-b border-(--border-subtle) px-2 py-2 sm:px-3">
          <button
            type="button"
            onClick={onClose}
            className="touch-manipulation rounded-md p-2 text-(--text-muted) hover:bg-(--bg-surface-hover) hover:text-(--text-primary)"
            aria-label="Close"
          >
            <IconX size={18} />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden md:flex-row">
          <aside
            className="order-2 shrink-0 border-b border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-4 md:order-1 md:min-w-[280px] md:max-w-[360px] md:flex-none md:overflow-y-auto md:border-b-0 md:border-r md:px-5 md:py-6"
            aria-label="Order summary"
          >
            <h3 className="text-quiet-uppercase mb-3">Order summary</h3>
            {displaySummary ? (
              <>
                <p className="text-xl font-semibold text-success">
                  {displaySummary.priceNow}
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-sm text-(--text-secondary)">
                  {displaySummary.priceRecurring}
                  <IconHelpCircle
                    size={14}
                    className="shrink-0 text-(--text-muted)"
                    aria-hidden
                  />
                </p>
                <p className="mt-3 font-medium text-(--text-primary)">
                  {displaySummary.productName}
                </p>
                <p className="text-sm text-(--text-secondary)">
                  {displaySummary.subscriptionLabel}
                </p>
                <p className="mt-1 text-sm text-(--text-muted)">
                  Qty: {displaySummary.quantity}
                </p>
                <dl className="mt-4 space-y-1.5 border-t border-(--border-subtle) pt-4 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-(--text-secondary)">Subtotal</dt>
                    <dd className="font-medium text-(--text-primary)">
                      {displaySummary.subtotal}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-(--text-secondary)">VAT</dt>
                    <dd className="font-medium text-(--text-primary)">
                      {displaySummary.vat}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-(--text-secondary)">Due today</dt>
                    <dd className="font-medium text-(--text-primary)">
                      {displaySummary.dueToday}
                    </dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-(--text-secondary)">
                      Due on {displaySummary.dueOnDate}
                    </dt>
                    <dd className="font-medium text-(--text-primary)">
                      {displaySummary.priceNow}
                    </dd>
                  </div>
                </dl>
              </>
            ) : (
              <p className="text-sm text-(--text-secondary)">
                Complete your payment details on the right.
              </p>
            )}
          </aside>
          <div
            className={`${PADDLE_INLINE_FRAME_TARGET} order-1 min-h-[450px] min-w-0 flex-1 overflow-y-auto md:order-2`}
            style={{ minHeight: PADDLE_FRAME_INITIAL_HEIGHT + "px" }}
          />
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
