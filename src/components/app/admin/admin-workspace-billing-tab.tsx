"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { CardRoot, CardHeader, CardContent } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  IN_APP_PLAN_CATALOG,
  formatPriceMonthly,
  formatPriceExact,
  type PlanCode,
} from "@/lib/billing/plan-catalog";

type BillingSummary = {
  planCode: string;
  subscriptionStatus: string;
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd?: boolean;
  pendingPlanCode?: string | null;
  pendingChangeType?: string | null;
  entitlementEffectiveUntil?: string | null;
  paymentStatus?: string | null;
  graceEndsAt?: string | null;
  pastDueSince?: string | null;
  graceUntil?: string | null;
  included: number;
  rolloverAvailable: number;
  used: number;
  overageEstimate: number;
  threshold80: boolean;
  threshold100: boolean;
  overageCapReached: boolean;
  meters: {
    pdfExports: { included: number; used: number; overageEstimateCents: number };
    zipExports: { included: number; used: number };
  };
};

type BillingTransactionItem = {
  id: string;
  providerTransactionId?: string;
  billedAt: string;
  status: string;
  total: { cents: number; currency: string };
  invoiceUrl?: string;
  receiptNumber?: string;
  isRevised?: boolean;
};

type PaymentMethodDisplay = {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
};

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  scale: "Scale",
  enterprise: "Enterprise",
};

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  american_express: "American Express",
  discover: "Discover",
};

function formatCardBrand(brand: string): string {
  return (
    CARD_BRAND_LABELS[brand.toLowerCase()] ??
    brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()
  );
}

function CardBrandIcon({ brand, className }: { brand: string; className?: string }) {
  const key = brand.toLowerCase().replace(/\s+/g, "_");
  const normalized = key === "american_express" ? "amex" : key;
  const containerClassName = `flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) ${className ?? ""}`;

  if (normalized === "visa") {
    return (
      <div className={containerClassName} aria-hidden title="Visa">
        <svg width={40} height={26} viewBox="0 0 40 26" fill="none">
          <rect width={40} height={26} rx={4} fill="#1A1F71" fillOpacity={0.15} />
          <text
            x={20}
            y={17}
            textAnchor="middle"
            fill="#1A1F71"
            fontSize={10}
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
          >
            VISA
          </text>
        </svg>
      </div>
    );
  }
  if (normalized === "mastercard") {
    return (
      <div className={containerClassName} aria-hidden title="Mastercard">
        <svg width={40} height={26} viewBox="0 0 40 26" fill="none">
          <rect width={40} height={26} rx={4} fill="#EB001B" fillOpacity={0.12} />
          <circle cx={15} cy={13} r={8} fill="#EB001B" />
          <circle cx={25} cy={13} r={8} fill="#F79E1B" fillOpacity={0.95} />
          <path
            fill="#FF5F00"
            d="M25 7.3a8 8 0 000 11.4 8 8 0 010-11.4zM15 7.3a8 8 0 010 11.4 8 8 0 000-11.4z"
          />
        </svg>
      </div>
    );
  }
  if (normalized === "amex" || normalized === "american_express") {
    return (
      <div className={containerClassName} aria-hidden title="American Express">
        <svg width={40} height={26} viewBox="0 0 40 26" fill="none">
          <rect width={40} height={26} rx={4} fill="#006FCF" fillOpacity={0.15} />
          <text
            x={20}
            y={16}
            textAnchor="middle"
            fill="#006FCF"
            fontSize={7}
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
          >
            AMEX
          </text>
        </svg>
      </div>
    );
  }
  if (normalized === "discover") {
    return (
      <div className={containerClassName} aria-hidden title="Discover">
        <svg width={40} height={26} viewBox="0 0 40 26" fill="none">
          <rect width={40} height={26} rx={4} fill="#FF6000" fillOpacity={0.2} />
          <text
            x={20}
            y={16}
            textAnchor="middle"
            fill="#FF6000"
            fontSize={8}
            fontWeight="bold"
            fontFamily="system-ui, sans-serif"
          >
            DISCOVER
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div className={containerClassName} aria-hidden title={formatCardBrand(brand)}>
      <span className="text-xs font-semibold text-(--text-muted)">
        {formatCardBrand(brand).slice(0, 2).toUpperCase()}
      </span>
    </div>
  );
}

function formatExpiry(month: number, year: number): string {
  try {
    const date = new Date(year, month - 1, 1);
    return date.toLocaleDateString("en-US", { month: "long", year: "numeric" });
  } catch {
    return `${month}/${year}`;
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

function useBillingState(summary: BillingSummary | null) {
  if (!summary) {
    return {
      currentPlan: "free" as PlanCode,
      hasPaidPlan: false,
      isCancelingAtPeriodEnd: false,
      isPastDue: false,
      isInGrace: false,
      isCanceled: false,
      isSuspended: false,
    };
  }
  const status = summary.subscriptionStatus.toUpperCase();
  const now = new Date();
  const graceUntil = summary.graceUntil ? new Date(summary.graceUntil) : null;
  return {
    currentPlan:
      (() => {
        const pc = summary.planCode.toLowerCase();
        if (pc === "enterprise") return "scale";
        return (pc as PlanCode) || "free";
      })(),
    hasPaidPlan: ["starter", "pro", "scale", "enterprise"].includes(
      summary.planCode.toLowerCase()
    ),
    isCancelingAtPeriodEnd: Boolean(summary.cancelAtPeriodEnd),
    isPastDue: status === "PAST_DUE",
    isInGrace: Boolean(graceUntil && now < graceUntil),
    isCanceled: status === "CANCELED",
    isSuspended: status === "SUSPENDED",
  };
}

function statusBadgeVariant(
  status: string
): "default" | "success" | "warning" | "destructive" | "secondary" {
  const s = status.toUpperCase();
  if (s === "ACTIVE" || s === "TRIAL") return "success";
  if (s === "PAST_DUE") return "warning";
  if (s === "SUSPENDED" || s === "CANCELED") return "destructive";
  return "secondary";
}

function statusBadgeLabel(
  status: string,
  cancelAtPeriodEnd?: boolean,
  pendingPlanCode?: string | null,
  periodEnd?: string,
  pendingChangeType?: string | null,
  planCode?: string | null
): string {
  if (pendingChangeType === "cancel_to_free_end_of_period") return "Canceling";
  if (cancelAtPeriodEnd && (pendingPlanCode === "free" || pendingPlanCode == null))
    return "Canceling";
  if (cancelAtPeriodEnd && pendingPlanCode && pendingPlanCode !== "free") {
    return periodEnd ? `Active until ${formatDate(periodEnd)}` : "Active";
  }
  const s = status.toUpperCase();
  if (s === "ACTIVE") return "Active";
  if (s === "TRIAL") return "Trial";
  if (s === "PAST_DUE") return "Past due";
  if (s === "SUSPENDED") return "Suspended";
  if (s === "CANCELED") {
    if (!planCode || planCode === "free") return "Free";
    return "Canceled";
  }
  return status;
}

type Props = { tenantId: string };

export function AdminWorkspaceBillingTab({ tenantId }: Props) {
  const apiFetch = useApiFetch();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [transactions, setTransactions] = useState<BillingTransactionItem[]>([]);
  const transactionsLengthRef = useRef(0);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsLoadingMore, setTransactionsLoadingMore] = useState(false);
  const [transactionsHasMore, setTransactionsHasMore] = useState(false);
  const transactionsScrollSentinelRef = useRef<HTMLTableRowElement>(null);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDisplay | null | undefined>(
    undefined
  );
  const [paymentMethodLoading, setPaymentMethodLoading] = useState(false);

  const billingState = useBillingState(summary);

  const base = `/api/admin/workspaces/${tenantId}/billing`;

  const fetchSummary = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      setLoading(true);
      try {
        const res = await apiFetch(`${base}/summary`, {
          signal,
          showToastOnError: false,
        });
        if (signal?.aborted) return;
        if (!res.ok) {
          const data = (await res.json().catch(() => ({}))) as {
            error?: { message?: string };
          };
          setError(data.error?.message ?? "Failed to load billing summary.");
          setSummary(null);
          return;
        }
        const json = (await res.json()) as { data?: BillingSummary };
        setSummary(json.data ?? null);
      } catch {
        if (signal?.aborted) return;
        setError("Failed to load billing summary.");
        setSummary(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiFetch, base]
  );

  const TRANSACTIONS_PAGE_SIZE = 20;

  const fetchTransactions = useCallback(
    async (append: boolean = false) => {
      if (append) {
        setTransactionsLoadingMore(true);
      } else {
        setTransactionsLoading(true);
      }
      try {
        const offset = append ? transactionsLengthRef.current : 0;
        const res = await apiFetch(
          `${base}/transactions?limit=${TRANSACTIONS_PAGE_SIZE}&offset=${offset}`,
          { showToastOnError: false }
        );
        if (!res.ok) {
          if (!append) {
            setTransactions([]);
            transactionsLengthRef.current = 0;
          }
          setTransactionsHasMore(false);
          return;
        }
        const json = (await res.json()) as {
          data?: { transactions?: BillingTransactionItem[]; hasMore?: boolean };
        };
        const data = json.data;
        const list = Array.isArray(data?.transactions) ? data.transactions : [];
        setTransactionsHasMore(Boolean(data?.hasMore));
        if (append) {
          setTransactions((prev) => {
            const next = [...prev, ...list];
            transactionsLengthRef.current = next.length;
            return next;
          });
        } else {
          setTransactions(list);
          transactionsLengthRef.current = list.length;
        }
      } catch {
        if (!append) {
          setTransactions([]);
          transactionsLengthRef.current = 0;
        }
        setTransactionsHasMore(false);
      } finally {
        if (append) {
          setTransactionsLoadingMore(false);
        } else {
          setTransactionsLoading(false);
        }
      }
    },
    [apiFetch, base]
  );

  const fetchPaymentMethod = useCallback(async () => {
    setPaymentMethodLoading(true);
    try {
      const res = await apiFetch(`${base}/payment-method`, {
        showToastOnError: false,
      });
      if (!res.ok) {
        setPaymentMethod(null);
        return;
      }
      const json = (await res.json()) as {
        data?: { paymentMethod?: PaymentMethodDisplay | null };
      };
      const pm = json.data?.paymentMethod ?? null;
      setPaymentMethod(pm ?? null);
    } catch {
      setPaymentMethod(null);
    } finally {
      setPaymentMethodLoading(false);
    }
  }, [apiFetch, base]);

  useEffect(() => {
    const controller = new AbortController();
    fetchSummary(controller.signal);
    return () => controller.abort();
  }, [fetchSummary]);

  useEffect(() => {
    if (!summary) return;
    fetchTransactions();
  }, [summary, fetchTransactions]);

  const shouldShowPaymentMethod =
    summary &&
    (summary.planCode === "starter" ||
      summary.planCode === "pro" ||
      summary.planCode === "scale" ||
      summary.planCode === "enterprise" ||
      summary.subscriptionStatus.toUpperCase() === "PAST_DUE" ||
      summary.subscriptionStatus.toUpperCase() === "SUSPENDED");

  useEffect(() => {
    if (!shouldShowPaymentMethod) return;
    fetchPaymentMethod();
  }, [shouldShowPaymentMethod, fetchPaymentMethod]);

  useEffect(() => {
    const sentinel = transactionsScrollSentinelRef.current;
    if (!sentinel || !transactionsHasMore || transactionsLoading || transactionsLoadingMore) return;
    const observer = new IntersectionObserver(
      (entries) => {
        const [e] = entries;
        if (!e?.isIntersecting) return;
        if (transactionsHasMore && !transactionsLoading && !transactionsLoadingMore) {
          fetchTransactions(true);
        }
      },
      { root: null, rootMargin: "120px", threshold: 0 }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [transactionsHasMore, transactionsLoading, transactionsLoadingMore, fetchTransactions]);

  const openInvoice = useCallback((t: BillingTransactionItem) => {
    const statusLower = t.status?.toLowerCase() ?? "";
    if (statusLower !== "completed") return;
    if (t.invoiceUrl) {
      window.open(t.invoiceUrl, "_blank", "noopener,noreferrer");
      return;
    }
    window.open(
      `${base}/transactions/${t.id}/invoice-redirect`,
      "_blank",
      "noopener,noreferrer"
    );
  }, [base]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) p-3 text-sm text-(--color-warning)">
          Platform Admin view — billing data is read-only. Plan and payment changes must be made by
          the workspace owner.
        </div>
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Read-only view of workspace plan, usage, and invoices.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CardRoot className="shadow-sm">
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-6 w-24" />
            </CardHeader>
          </CardRoot>
          <CardRoot className="shadow-sm">
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
            </CardContent>
          </CardRoot>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) p-3 text-sm text-(--color-warning)">
          Platform Admin view — billing data is read-only. Plan and payment changes must be made by
          the workspace owner.
        </div>
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Read-only view of workspace plan, usage, and invoices.
          </p>
        </div>
        <Alert variant="destructive" title="Error" description={error} />
        <button
          type="button"
          onClick={() => fetchSummary()}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        <div className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) p-3 text-sm text-(--color-warning)">
          Platform Admin view — billing data is read-only. Plan and payment changes must be made by
          the workspace owner.
        </div>
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Read-only view of workspace plan, usage, and invoices.
          </p>
        </div>
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-5 shadow-sm">
          <p className="text-sm text-(--text-muted)">
            No billing data available for this workspace.
          </p>
        </div>
      </div>
    );
  }

  const allowance = summary.included + summary.rolloverAvailable;
  const usagePct = allowance > 0 ? Math.min(100, (summary.used / allowance) * 100) : 0;
  const planLabel = PLAN_LABELS[summary.planCode] ?? summary.planCode;
  const nextChargeDate = summary?.periodEnd ? formatDate(summary.periodEnd) : null;
  const currentPlanItem = IN_APP_PLAN_CATALOG.find((p) => p.code === billingState.currentPlan);

  const isScheduledCancelToFree =
    summary?.pendingChangeType === "cancel_to_free_end_of_period" ||
    (Boolean(summary?.cancelAtPeriodEnd) &&
      (summary?.pendingPlanCode === "free" || summary?.pendingPlanCode == null));
  const isScheduledDowngradeToPaid =
    summary?.pendingChangeType === "downgrade_end_of_period" &&
    summary?.pendingPlanCode &&
    summary.pendingPlanCode !== "free";

  let nextInvoicePlanLabel = planLabel;
  let nextInvoicePlanCents = currentPlanItem?.priceMonthlyCents ?? 0;
  if (isScheduledCancelToFree) {
    nextInvoicePlanLabel = "Free";
    nextInvoicePlanCents = 0;
  } else if (isScheduledDowngradeToPaid && summary?.pendingPlanCode) {
    const targetPlanItem = IN_APP_PLAN_CATALOG.find((p) => p.code === summary.pendingPlanCode);
    nextInvoicePlanLabel = PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode;
    nextInvoicePlanCents = targetPlanItem?.priceMonthlyCents ?? 0;
  }

  const nextInvoiceOverageCents = isScheduledCancelToFree ? 0 : (summary?.overageEstimate ?? 0);
  const nextInvoiceTotalCents = nextInvoicePlanCents + nextInvoiceOverageCents;

  return (
    <div className="space-y-6">
      <div className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) p-3 text-sm text-(--color-warning)">
        Platform Admin view — billing data is read-only. Plan and payment changes must be made by the
        workspace owner.
      </div>

      <div>
        <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Read-only view of workspace plan, usage, and invoices.
        </p>
      </div>

      {summary.pendingChangeType === "cancel_to_free_end_of_period" && (
        <Alert
          variant="info"
          title="Cancellation scheduled"
          description={`Scheduled move to Free on ${formatDate(summary.entitlementEffectiveUntil ?? summary.periodEnd)}. The workspace owner can resume a paid plan before then.`}
        />
      )}
      {summary.pendingChangeType === "downgrade_end_of_period" && summary.pendingPlanCode && (
        <Alert
          variant="info"
          title="Downgrade scheduled"
          description={`Downgrade to ${PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode} on ${formatDate(summary.entitlementEffectiveUntil ?? summary.periodEnd)}. Current plan remains ${PLAN_LABELS[summary.planCode] ?? summary.planCode} until then.`}
        />
      )}
      {summary.paymentStatus === "past_due" && (
        <Alert
          variant="warning"
          title="Payment failed"
          description={
            summary.graceEndsAt
              ? `Renewal payment could not be processed. Grace period ends on ${formatDate(summary.graceEndsAt)}. The workspace owner should update the payment method.`
              : "Renewal payment could not be processed. The workspace owner should update the payment method."
          }
        />
      )}
      {billingState.isPastDue && summary.paymentStatus !== "past_due" && (
        <Alert
          variant="warning"
          title="Payment issue"
          description="Subscription is past due. The workspace owner should update the payment method to avoid service interruption."
        />
      )}
      {billingState.isInGrace &&
        summary.graceUntil &&
        !billingState.isPastDue &&
        summary.paymentStatus !== "past_due" && (
          <Alert
            variant="warning"
            description={`Grace period until ${formatDate(summary.graceUntil)}.`}
          />
        )}
      {billingState.isSuspended && (
        <Alert
          variant="destructive"
          title="Suspended"
          description="Subscription is suspended until billing is resolved by the workspace owner."
        />
      )}
      {billingState.isCanceled && summary.planCode !== "free" && (
        <Alert
          variant="info"
          title="Canceled"
          description={
            summary.periodEnd
              ? `Access until ${formatDate(summary.periodEnd)}. Reactivation is available to the workspace owner via plan change.`
              : "Reactivation is available to the workspace owner via plan change."
          }
        />
      )}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        <CardRoot className="relative overflow-hidden border border-(--border-strong) bg-(--bg-surface-elev) shadow-sm">
          <CardHeader className="pb-4">
            <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
              Plan &amp; subscription
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold tracking-tight text-(--text-primary)">
                {planLabel} plan
              </span>
              <Badge
                variant={
                  billingState.isCanceled && summary.planCode === "free"
                    ? "secondary"
                    : billingState.isCancelingAtPeriodEnd &&
                        (summary.pendingPlanCode === "free" || !summary.pendingPlanCode)
                      ? "secondary"
                      : statusBadgeVariant(summary.subscriptionStatus)
                }
              >
                {statusBadgeLabel(
                  summary.subscriptionStatus,
                  summary.cancelAtPeriodEnd,
                  summary.pendingPlanCode,
                  summary.periodEnd,
                  summary.pendingChangeType,
                  summary.planCode
                )}
              </Badge>
            </div>
            {billingState.hasPaidPlan &&
              currentPlanItem &&
              currentPlanItem.priceMonthlyCents > 0 && (
                <p className="mt-2 text-base font-medium text-(--text-primary)">
                  {formatPriceMonthly(currentPlanItem.priceMonthlyCents)} / month
                </p>
              )}
            {nextChargeDate && billingState.hasPaidPlan && (
              <p className="mt-1 text-sm text-(--text-muted)">Next charge · {nextChargeDate}</p>
            )}
            <p className="mt-3 text-sm text-(--text-secondary)">
              Usage this period · {summary.used} / {allowance > 0 ? allowance : summary.included}{" "}
              requests
              {summary.rolloverAvailable > 0 ? ` (${summary.rolloverAvailable} rollover)` : ""}
            </p>
            {summary.pendingPlanCode && summary.pendingPlanCode !== "free" && (
              <p className="mt-2 text-xs text-(--text-muted)">
                Scheduled to downgrade to{" "}
                {PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode} on{" "}
                {formatDate(summary.periodEnd)}.
              </p>
            )}
          </CardHeader>
        </CardRoot>

        <CardRoot className="shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
              Usage this month
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <p className="text-sm font-medium text-(--text-secondary)">Requests used</p>
              <p className="mt-1 text-3xl font-bold tracking-tight text-(--text-primary)">
                {summary.used} / {allowance > 0 ? allowance : summary.included} requests
              </p>
            </div>
            <div
              className="h-2.5 w-full overflow-hidden rounded-full bg-(--border-subtle)"
              role="progressbar"
              aria-valuenow={usagePct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className={`h-full rounded-full transition-[width] ${
                  summary.threshold100
                    ? "bg-(--destructive)"
                    : summary.threshold80
                      ? "bg-amber-500"
                      : "bg-(--color-primary)"
                }`}
                style={{ width: `${usagePct}%` }}
              />
            </div>
            {nextChargeDate && (
              <p className="text-xs text-(--text-muted)">Resets {nextChargeDate}</p>
            )}
            {summary.threshold80 && !summary.threshold100 && (
              <p className="text-xs text-amber-600 dark:text-amber-400">
                This workspace has used 80% or more of its request allowance.
              </p>
            )}
            {summary.threshold100 && (
              <p className="text-xs text-(--destructive)">
                This workspace has reached its request allowance for this period.
              </p>
            )}
            {summary.overageEstimate > 0 && (
              <p className="text-xs text-(--text-muted)">
                Overage estimate: ${(summary.overageEstimate / 100).toFixed(2)}
                {summary.overageCapReached && " (cap reached)"}
              </p>
            )}
          </CardContent>
        </CardRoot>
      </div>

      {(billingState.hasPaidPlan && nextChargeDate) ||
      billingState.hasPaidPlan ||
      billingState.isPastDue ||
      billingState.isSuspended ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {billingState.hasPaidPlan && nextChargeDate && (
            <CardRoot className="shadow-sm border border-(--border-subtle)">
              <CardHeader className="pb-3">
                <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
                  Next invoice
                </p>
              </CardHeader>
              <CardContent className="space-y-2">
                {isScheduledCancelToFree ? (
                  <>
                    <p className="text-sm font-medium text-(--text-primary)">No upcoming invoice</p>
                    <p className="text-sm text-(--text-secondary)">
                      Scheduled move to Free on {nextChargeDate}. No charge after that date.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm font-medium text-(--text-primary)">{nextChargeDate}</p>
                    <p className="text-sm text-(--text-secondary)">
                      {nextInvoicePlanLabel} plan · {formatPriceMonthly(nextInvoicePlanCents)}
                    </p>
                    {nextInvoiceOverageCents > 0 && (
                      <p className="text-sm text-(--text-secondary)">
                        Estimated overage · ${(nextInvoiceOverageCents / 100).toFixed(2)}
                      </p>
                    )}
                    <p className="border-t border-(--border-subtle) pt-2 text-base font-semibold text-(--text-primary)">
                      Estimated total · {formatPriceExact(nextInvoiceTotalCents)}
                    </p>
                  </>
                )}
              </CardContent>
            </CardRoot>
          )}
          {(billingState.hasPaidPlan || billingState.isPastDue || billingState.isSuspended) && (
            <CardRoot className="shadow-sm border border-(--border-subtle)">
              <CardHeader className="pb-3">
                <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
                  Payment method
                </p>
              </CardHeader>
              <CardContent>
                {paymentMethodLoading ? (
                  <Skeleton className="h-14 w-full max-w-sm" />
                ) : paymentMethod ? (
                  <>
                    <div className="flex items-start gap-3">
                      <CardBrandIcon brand={paymentMethod.brand} className="shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-(--text-primary)">
                          {formatCardBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
                        </p>
                        <p className="mt-0.5 text-xs text-(--text-muted)">
                          Expires {formatExpiry(paymentMethod.expiryMonth, paymentMethod.expiryYear)}
                        </p>
                      </div>
                    </div>
                    {nextChargeDate && (
                      <p className="mt-2 text-xs text-(--text-muted)">
                        Used for next invoice {nextChargeDate}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-sm text-(--text-muted)">No payment method on file.</p>
                )}
              </CardContent>
            </CardRoot>
          )}
        </div>
      ) : null}

      {transactions.length > 0 && (
        <CardRoot className="w-full shadow-sm">
          <CardHeader>
            <p className="text-xs font-medium tracking-wide text-(--text-muted) uppercase">
              Invoices
            </p>
          </CardHeader>
          <CardContent className="p-0">
            {transactionsLoading ? (
              <div className="p-4">
                <Skeleton className="h-20 w-full" />
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 z-10 border-b border-(--border-subtle) bg-(--bg-surface) shadow-[0_1px_0_0_var(--border-subtle)]">
                    <tr>
                      <th className="bg-(--bg-surface) px-4 py-3 text-left font-medium text-(--text-muted)">
                        Invoice
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-left font-medium text-(--text-muted)">
                        Period
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-left font-medium text-(--text-muted)">
                        Status
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-right font-medium text-(--text-muted)">
                        Amount
                      </th>
                      <th className="bg-(--bg-surface) px-4 py-3 text-right font-medium text-(--text-muted)">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {transactions.map((t) => {
                      const statusLower = t.status?.toLowerCase() ?? "";
                      const statusVariant =
                        statusLower === "completed"
                          ? "success"
                          : statusLower === "pending" || statusLower === "past_due"
                            ? "warning"
                            : statusLower === "failed"
                              ? "destructive"
                              : "secondary";
                      const canViewInvoice = statusLower === "completed";
                      return (
                        <tr
                          key={t.id}
                          className="border-b border-(--border-subtle) transition-colors hover:bg-(--bg-surface-elev)"
                        >
                          <td className="px-4 py-3 font-medium text-(--text-primary)">
                            {t.receiptNumber ?? "—"}
                          </td>
                          <td className="px-4 py-3 text-(--text-secondary)">
                            {formatDate(t.billedAt)}
                          </td>
                          <td className="px-4 py-3">
                            <Badge variant={statusVariant}>{t.status ?? "—"}</Badge>
                          </td>
                          <td className="px-4 py-3 text-right text-(--text-primary)">
                            {(t.total.cents / 100).toFixed(2)} {t.total.currency}
                          </td>
                          <td className="px-4 py-3 text-right">
                            {canViewInvoice ? (
                              <button
                                type="button"
                                onClick={() => openInvoice(t)}
                                className="text-sm font-medium text-(--color-primary) underline hover:no-underline"
                              >
                                View invoice
                              </button>
                            ) : (
                              <span className="text-(--text-muted)">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                    {transactions.length > 0 &&
                      (transactionsHasMore || transactionsLoadingMore) && (
                        <tr ref={transactionsScrollSentinelRef}>
                          <td colSpan={5} className="px-4 py-3 text-center">
                            {transactionsLoadingMore ? (
                              <span className="inline-flex items-center gap-2 text-sm text-(--text-muted)">
                                <Spinner size="sm" />
                                Loading more…
                              </span>
                            ) : (
                              <span className="text-sm text-(--text-muted)">Scroll for more</span>
                            )}
                          </td>
                        </tr>
                      )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </CardRoot>
      )}
    </div>
  );
}
