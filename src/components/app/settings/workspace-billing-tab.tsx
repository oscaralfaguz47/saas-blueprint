"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import {
  CardRoot,
  CardHeader,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  IN_APP_PLAN_CATALOG,
  formatPriceMonthly,
  isUpgrade,
  isDowngrade,
  type PlanCode,
  type InAppPlanItem,
} from "@/lib/billing/plan-catalog";

import { BILLING_COUNTRY_OPTIONS } from "@/lib/countries";
import { SearchableSelect } from "@/components/ui/searchable-select";

type BillingSummary = {
  planCode: string;
  subscriptionStatus: string;
  periodStart: string;
  periodEnd: string;
  cancelAtPeriodEnd?: boolean;
  pendingPlanCode?: string | null;
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

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
};

function formatPeriod(start: string, end: string): string {
  try {
    const s = new Date(start);
    const e = new Date(end);
    return `${s.toLocaleDateString("en-US", { month: "short", year: "numeric" })} (through ${e.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
  } catch {
    return "";
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

/** Derived UI state from summary (subscription state → UI mapping). */
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
    currentPlan: (summary.planCode.toLowerCase() as PlanCode) || "free",
    hasPaidPlan: summary.planCode === "starter" || summary.planCode === "pro",
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
  cancelAtPeriodEnd?: boolean
): string {
  if (cancelAtPeriodEnd) return "Canceling";
  const s = status.toUpperCase();
  if (s === "ACTIVE") return "Active";
  if (s === "TRIAL") return "Trial";
  if (s === "PAST_DUE") return "Past due";
  if (s === "SUSPENDED") return "Suspended";
  if (s === "CANCELED") return "Canceled";
  return status;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;
const MAX_POLL_ATTEMPTS = Math.floor(POLL_TIMEOUT_MS / POLL_INTERVAL_MS);

export function WorkspaceBillingTab() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<BillingSummary | null>(null);
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [confirmPlanOpen, setConfirmPlanOpen] = useState(false);
  const [confirmTarget, setConfirmTarget] = useState<{
    plan: InAppPlanItem;
    direction: "upgrade" | "downgrade";
  } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showBillingDetails, setShowBillingDetails] = useState(false);
  const [billingCountryCode, setBillingCountryCode] = useState("");
  const [billingPostalCode, setBillingPostalCode] = useState("");
  const [billingRegion, setBillingRegion] = useState("");
  const [billingCity, setBillingCity] = useState("");
  const [billingFirstLine, setBillingFirstLine] = useState("");
  const [billingSecondLine, setBillingSecondLine] = useState("");
  const [businessToggle, setBusinessToggle] = useState(false);
  const [companyName, setCompanyName] = useState("");
  const [taxIdentifier, setTaxIdentifier] = useState("");
  const [taxValidationError, setTaxValidationError] = useState<string | null>(null);
  const [countryMismatch, setCountryMismatch] = useState(false);
  const [postCheckoutState, setPostCheckoutState] = useState<
    "idle" | "polling" | "resolved" | "timeout"
  >("idle");
  const pollAttemptsRef = useRef(0);
  const postCheckoutPollStartedRef = useRef(false);
  const postCheckoutGotDataRef = useRef(false);
  const canceledToastShownRef = useRef(false);
  const apiFetch = useApiFetch();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const pathname = usePathname();

  const billingState = useBillingState(summary);
  const billingParam = searchParams.get("billing");

  const fetchSummary = useCallback(
    async (signal?: AbortSignal) => {
      setError(null);
      setLoading(true);
      try {
        const res = await apiFetch("/api/billing/summary", {
          signal,
          showToastOnError: false,
        });
        if (signal?.aborted) return;
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          setError(
            (data as { message?: string }).message ??
              "Failed to load billing summary."
          );
          setSummary(null);
          return;
        }
        const json = await res.json();
        setSummary((json.data as BillingSummary) ?? null);
      } catch (e) {
        if (signal?.aborted) return;
        setError("Failed to load billing summary.");
        setSummary(null);
      } finally {
        if (!signal?.aborted) setLoading(false);
      }
    },
    [apiFetch]
  );

  const refetchBillingState = useCallback(
    async (silent?: boolean): Promise<BillingSummary | null> => {
      if (!silent) setIsRefreshing(true);
      try {
        const res = await apiFetch("/api/billing/summary", {
          showToastOnError: false,
        });
        if (!res.ok) return null;
        const json = await res.json();
        const data = json.data as BillingSummary | null;
        setSummary(data ?? null);
        if (!silent) setError(null);
        return data;
      } catch {
        if (!silent) toast.addToast("error", "Failed to refresh billing status.");
        return null;
      } finally {
        if (!silent) setIsRefreshing(false);
      }
    },
    [apiFetch, toast]
  );

  useEffect(() => {
    if (billingParam === "updated") {
      setLoading(false);
      return;
    }
    if (postCheckoutGotDataRef.current) {
      postCheckoutGotDataRef.current = false;
      return;
    }
    const controller = new AbortController();
    fetchSummary(controller.signal);
    return () => controller.abort();
  }, [fetchSummary, billingParam]);

  useEffect(() => {
    if (billingParam !== "canceled") {
      canceledToastShownRef.current = false;
      return;
    }
    if (canceledToastShownRef.current) return;
    canceledToastShownRef.current = true;
    toast.addToast("info", "Checkout canceled.");
    const params = new URLSearchParams(searchParams.toString());
    params.delete("billing");
    const qs = params.toString();
    router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
  }, [billingParam, pathname, router, searchParams, toast]);

  useEffect(() => {
    if (billingParam !== "updated" || postCheckoutPollStartedRef.current) return;
    postCheckoutPollStartedRef.current = true;

    const expectedPlan = (): PlanCode | null => {
      try {
        const prev = sessionStorage.getItem("billing:postCheckoutPlan");
        if (prev === "starter" || prev === "pro") return prev;
      } catch {
        // ignore
      }
      return null;
    };
    const targetPlan = expectedPlan();

    const isResolved = (data: BillingSummary | null): boolean => {
      if (!data) return false;
      const plan = (data.planCode.toLowerCase() || "free") as PlanCode;
      const status = data.subscriptionStatus.toUpperCase();
      if (targetPlan && plan === targetPlan && status === "ACTIVE") return true;
      if (!targetPlan && (plan === "starter" || plan === "pro") && status === "ACTIVE")
        return true;
      return false;
    };

    setPostCheckoutState("polling");
    setLoading(true);
    pollAttemptsRef.current = 0;

    const callReconcile = async () => {
      try {
        await apiFetch("/api/billing/paddle/reconcile", {
          method: "POST",
          showToastOnError: false,
        });
      } catch {
        // ignore
      }
    };

    let mounted = true;
    const poll = async () => {
      await callReconcile();
      const data = await refetchBillingState(true);
      if (!mounted) return;
      setLoading(false);
      pollAttemptsRef.current += 1;
      if (data && isResolved(data)) {
        setPostCheckoutState("resolved");
        const planLabel = PLAN_LABELS[data.planCode] ?? data.planCode;
        toastRef.current.addToast("success", `Plan updated to ${planLabel}.`);
        try {
          sessionStorage.removeItem("billing:postCheckoutPlan");
        } catch {
          // ignore
        }
        postCheckoutGotDataRef.current = true;
        router.replace("/app/settings/workspace?tab=billing", { scroll: false });
        return;
      }
      if (pollAttemptsRef.current >= MAX_POLL_ATTEMPTS) {
        setPostCheckoutState("timeout");
        setLoading(false);
        return;
      }
      setTimeout(poll, POLL_INTERVAL_MS);
    };

    poll();
    return () => {
      mounted = false;
    };
  }, [billingParam, apiFetch, router]);

  // When summary already shows paid+active while polling (e.g. webhook beat us), transition to resolved so the banner hides
  useEffect(() => {
    if (
      billingParam !== "updated" ||
      postCheckoutState !== "polling" ||
      !summary
    )
      return;
    const plan = (summary.planCode?.toLowerCase() || "free") as PlanCode;
    const status = summary.subscriptionStatus?.toUpperCase() ?? "";
    if (
      (plan === "starter" || plan === "pro") &&
      status === "ACTIVE"
    ) {
      setPostCheckoutState("resolved");
      const planLabel = PLAN_LABELS[summary.planCode] ?? summary.planCode;
      toastRef.current.addToast("success", `Plan updated to ${planLabel}.`);
      try {
        sessionStorage.removeItem("billing:postCheckoutPlan");
      } catch {
        // ignore
      }
      postCheckoutGotDataRef.current = true;
      router.replace("/app/settings/workspace?tab=billing", { scroll: false });
    }
  }, [billingParam, postCheckoutState, summary, router]);

  const handleOpenChangePlan = useCallback(() => {
    setChangePlanOpen(true);
  }, []);

  const handleManageSubscription = useCallback(async () => {
    setPortalLoading(true);
    try {
      const res = await apiFetch("/api/billing/paddle/portal", {
        method: "POST",
        showToastOnError: true,
      });
      if (!res.ok) return;
      const json = await res.json();
      const url = (json.data as { url?: string })?.url;
      if (url) window.location.href = url;
    } finally {
      setPortalLoading(false);
    }
  }, [apiFetch]);

  const handleSelectPlan = useCallback(
    (plan: InAppPlanItem) => {
      const current = billingState.currentPlan;
      if (plan.code === current) return;
      if (isUpgrade(current, plan.code)) {
        setConfirmTarget({ plan, direction: "upgrade" });
        setChangePlanOpen(false);
        setConfirmPlanOpen(true);
      } else if (isDowngrade(current, plan.code)) {
        setConfirmTarget({ plan, direction: "downgrade" });
        setChangePlanOpen(false);
        setConfirmPlanOpen(true);
      }
    },
    [billingState.currentPlan]
  );

  const handleConfirmUpgrade = useCallback(
    async (skipTaxId?: boolean) => {
      if (!confirmTarget || confirmTarget.direction !== "upgrade") return;
      setTaxValidationError(null);
      setCheckoutLoading(true);
      try {
        const hasAddress = !!billingCountryCode;
        const billing =
          hasAddress || businessToggle
            ? {
                address: hasAddress
                  ? {
                      countryCode: billingCountryCode,
                      postalCode: billingPostalCode || undefined,
                      region: billingRegion || undefined,
                      city: billingCity || undefined,
                      firstLine: billingFirstLine || undefined,
                      secondLine: billingSecondLine || undefined,
                    }
                  : undefined,
                businessToggle: businessToggle && !!companyName.trim(),
                companyName: companyName.trim() || undefined,
                taxIdentifier: taxIdentifier.trim() || undefined,
              }
            : undefined;
        const res = await apiFetch("/api/billing/paddle/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planCode: confirmTarget.plan.code,
            billing: billing ?? undefined,
            ...(skipTaxId && { skipTaxId: true }),
          }),
          showToastOnError: !skipTaxId,
        });
        const json = await res.json().catch(() => ({}));
        const errCode = (json as { details?: { code?: string }; error?: string }).details?.code;
        const errMessage = (json as { message?: string }).message;
        if (!res.ok && errCode === "TAX_IDENTIFIER_VALIDATION_FAILED") {
          setTaxValidationError(
            errMessage ?? "Tax identifier could not be validated for this country. You can continue without it."
          );
          return;
        }
        if (!res.ok) return;
        const url = (json.data as { checkoutUrl?: string })?.checkoutUrl;
        if (url) {
          try {
            sessionStorage.setItem("billing:postCheckoutPlan", confirmTarget.plan.code);
          } catch {
            // ignore
          }
          window.location.href = url;
        }
      } finally {
        setCheckoutLoading(false);
      }
    },
    [
      confirmTarget,
      apiFetch,
      billingCountryCode,
      billingPostalCode,
      billingRegion,
      billingCity,
      billingFirstLine,
      billingSecondLine,
      businessToggle,
      companyName,
      taxIdentifier,
    ]
  );

  const handleConfirmDowngrade = useCallback(async () => {
    if (!confirmTarget || confirmTarget.direction !== "downgrade") return;
    if (confirmTarget.plan.code !== "free" && confirmTarget.plan.code !== "starter")
      return;
    setScheduleLoading(true);
    try {
      const res = await apiFetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planCode: confirmTarget.plan.code }),
        showToastOnError: true,
      });
      if (!res.ok) return;
      setConfirmPlanOpen(false);
      setConfirmTarget(null);
      toast.addToast("success", "Downgrade scheduled.");
      await fetchSummary();
    } finally {
      setScheduleLoading(false);
    }
  }, [confirmTarget, apiFetch, toast, fetchSummary]);

  const closeConfirm = useCallback(() => {
    setConfirmPlanOpen(false);
    setConfirmTarget(null);
    setTaxValidationError(null);
  }, []);

  const loadBillingProfileForCheckout = useCallback(async () => {
    try {
      const res = await apiFetch("/api/billing/profile", { showToastOnError: false });
      if (!res.ok) return;
      const json = await res.json();
      const p = (json.data as { countryCode?: string; postalCode?: string; region?: string; city?: string; firstLine?: string; secondLine?: string; companyName?: string; taxIdentifier?: string; countryMismatch?: boolean } | null);
      if (p) {
        setBillingCountryCode(p.countryCode ?? "");
        setBillingPostalCode(p.postalCode ?? "");
        setBillingRegion(p.region ?? "");
        setBillingCity(p.city ?? "");
        setBillingFirstLine(p.firstLine ?? "");
        setBillingSecondLine(p.secondLine ?? "");
        setCompanyName(p.companyName ?? "");
        setTaxIdentifier(p.taxIdentifier ?? "");
        if ((p.companyName ?? "").trim()) setBusinessToggle(true);
        setShowBillingDetails(!!(p.countryCode ?? p.firstLine ?? p.city));
      }
    } catch {
      // ignore
    }
  }, [apiFetch]);

  useEffect(() => {
    if (confirmPlanOpen && confirmTarget?.direction === "upgrade") {
      loadBillingProfileForCheckout();
    }
  }, [confirmPlanOpen, confirmTarget?.direction, loadBillingProfileForCheckout]);

  useEffect(() => {
    if (loading || error) return;
    let cancelled = false;
    apiFetch("/api/billing/profile", { showToastOnError: false })
      .then((res) => {
        if (cancelled || !res.ok) return res.json().catch(() => null);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const p = json?.data as { countryMismatch?: boolean } | null;
        setCountryMismatch(!!p?.countryMismatch);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [loading, error, apiFetch]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Billing
          </h2>
          <p className="text-sm text-(--text-secondary)">
            Plan, usage, and overage for the current billing period.
          </p>
        </div>
        <CardRoot>
          <CardHeader>
            <Skeleton className="h-5 w-24" />
            <Skeleton className="mt-2 h-4 w-32" />
          </CardHeader>
          <CardContent className="space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-2 w-full" />
          </CardContent>
          <CardFooter>
            <Skeleton className="h-9 w-28" />
          </CardFooter>
        </CardRoot>
        <CardRoot>
          <CardHeader>
            <Skeleton className="h-5 w-20" />
          </CardHeader>
          <CardContent>
            <Skeleton className="h-2 w-full" />
          </CardContent>
        </CardRoot>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Billing
          </h2>
        </div>
        <Alert variant="destructive" title="Error" description={error} />
        <button
          type="button"
          onClick={() => fetchSummary()}
          className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
        >
          Try again
        </button>
      </div>
    );
  }

  if (!summary) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">
            Billing
          </h2>
        </div>
        <div className="rounded-lg border border-(--border-subtle) bg-(--card) p-4">
          <p className="text-sm text-(--text-muted)">
            No billing data available. Create or select a workspace with a plan
            to see usage.
          </p>
        </div>
      </div>
    );
  }

  const allowance = summary.included + summary.rolloverAvailable;
  const usagePct =
    allowance > 0 ? Math.min(100, (summary.used / allowance) * 100) : 0;
  const planLabel = PLAN_LABELS[summary.planCode] ?? summary.planCode;
  const primaryCtaLabel =
    billingState.isPastDue || billingState.isSuspended
      ? "Update payment method"
      : "Change plan";
  const showChangePlan =
    !billingState.isPastDue && !billingState.isSuspended;

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-base font-semibold text-(--text-primary)">
          Billing
        </h2>
        <p className="mt-0.5 text-sm text-(--text-secondary)">
          Plan, usage, and overage for the current billing period.
        </p>
      </div>

      {countryMismatch && (
        <Alert
          variant="warning"
          title="Billing country mismatch"
          description="Your invoice country in Paddle differs from your saved billing address country. Update billing details if needed."
        />
      )}

      {/* Post-checkout: finalizing (hides when we transition to resolved or timeout) */}
      {postCheckoutState === "polling" && (
        <Alert
          variant="info"
          title="Finalizing your subscription…"
          description="We're confirming your plan with the payment provider. This usually takes a few seconds."
        />
      )}
      {postCheckoutState === "timeout" && (
        <Alert variant="warning" title="Still processing your payment">
          <p className="mt-1">
            We&apos;re still processing your payment. Refresh in a moment or check
            the billing portal.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setPostCheckoutState("idle");
                refetchBillingState();
              }}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev)"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
            >
              Manage subscription
            </button>
          </div>
        </Alert>
      )}

      {/* Status banners */}
      {billingState.isCancelingAtPeriodEnd && summary.pendingPlanCode && (
        <Alert
          variant="info"
          title="Plan change scheduled"
          description={`Your plan will change to ${PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode} on ${formatDate(summary.periodEnd)}. You'll keep your current plan until then.`}
        >
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="text-sm font-medium underline hover:no-underline disabled:opacity-50"
            >
              Manage subscription
            </button>
            {/* TODO: Undo scheduled downgrade — optional; stub or future API */}
          </div>
        </Alert>
      )}
      {billingState.isPastDue && (
        <Alert
          variant="warning"
          title="Payment issue"
          description="Your subscription is past due. Update your payment method to avoid service interruption."
        >
          <button
            type="button"
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {portalLoading ? "Loading…" : "Update payment method"}
          </button>
        </Alert>
      )}
      {billingState.isInGrace && summary.graceUntil && !billingState.isPastDue && (
        <Alert
          variant="warning"
          description={`Grace period until ${formatDate(summary.graceUntil)}.`}
        />
      )}
      {billingState.isSuspended && (
        <Alert
          variant="destructive"
          title="Suspended"
          description="Your subscription is suspended. Resolve billing to restore access."
        >
          <button
            type="button"
            onClick={handleManageSubscription}
            disabled={portalLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) px-3 text-sm font-medium disabled:opacity-50"
          >
            {portalLoading ? "Loading…" : "Manage subscription"}
          </button>
        </Alert>
      )}
      {billingState.isCanceled && (
        <Alert
          variant="info"
          title="Canceled"
          description={
            summary.periodEnd
              ? `Access until ${formatDate(summary.periodEnd)}. Reactivate by changing plan.`
              : "Reactivate by changing plan."
          }
        />
      )}

      {/* Plan card */}
      <CardRoot className="border-(--border-subtle)">
        <CardHeader className="pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
            Plan &amp; status
          </p>
          <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-base font-semibold text-(--text-primary)">
                {planLabel}
              </span>
              <Badge
                variant={
                  billingState.isCancelingAtPeriodEnd
                    ? "secondary"
                    : statusBadgeVariant(summary.subscriptionStatus)
                }
              >
                {statusBadgeLabel(
                  summary.subscriptionStatus,
                  summary.cancelAtPeriodEnd
                )}
              </Badge>
            </div>
            <span className="text-sm text-(--text-muted)">
              {billingState.hasPaidPlan
                ? formatPeriod(summary.periodStart, summary.periodEnd)
                : "No billing period"}
            </span>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <p className="text-sm text-(--text-muted)">
            {billingState.hasPaidPlan
              ? "Manage plan, usage, and renewal."
              : "Upgrade for more capacity and audit features."}
          </p>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center gap-2 border-t border-(--border-subtle) pt-3">
          {showChangePlan && (
            <button
              type="button"
              onClick={handleOpenChangePlan}
              className="inline-flex h-9 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              Change plan
            </button>
          )}
          {(billingState.hasPaidPlan ||
            billingState.isPastDue ||
            billingState.isSuspended ||
            billingState.isCanceled) && (
            <button
              type="button"
              onClick={handleManageSubscription}
              disabled={portalLoading}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
            >
              {portalLoading ? "Loading…" : "Manage subscription"}
            </button>
          )}
        </CardFooter>
      </CardRoot>

      {/* Usage card */}
      <CardRoot>
        <CardHeader>
          <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
            Usage
          </p>
        </CardHeader>
        <CardContent className="space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-(--text-secondary)">Requests</span>
            <span className="text-(--text-primary)">
              {summary.used} / {allowance > 0 ? allowance : summary.included}
              {summary.rolloverAvailable > 0 &&
                ` (${summary.rolloverAvailable} rollover)`}
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-(--border-subtle)"
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
          {summary.threshold80 && !summary.threshold100 && (
            <p className="text-xs text-amber-600 dark:text-amber-400">
              You&apos;ve used 80% or more of your request allowance.
            </p>
          )}
          {summary.threshold100 && (
            <p className="text-xs text-(--destructive)">
              You&apos;ve reached your request allowance for this period.
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

      {/* Change plan dialog */}
      <Dialog
        open={changePlanOpen}
        onClose={() => setChangePlanOpen(false)}
        title="Change plan"
        description="Compare plans and choose what fits your workspace. Upgrades apply immediately. Downgrades take effect at the end of your billing period."
        contentClassName="max-w-5xl"
      >
        <div className="grid gap-4 sm:grid-cols-3">
          {IN_APP_PLAN_CATALOG.map((plan) => {
            const isCurrent = plan.code === billingState.currentPlan;
            const canUpgrade =
              isUpgrade(billingState.currentPlan, plan.code) &&
              !billingState.isPastDue &&
              !billingState.isSuspended;
            const canDowngrade = isDowngrade(billingState.currentPlan, plan.code);
            return (
              <div
                key={plan.code}
                className={`rounded-xl border p-4 ${
                  plan.mostPopular
                    ? "border-(--color-primary)/50 bg-(--bg-surface-elev)"
                    : "border-(--border-subtle) bg-(--bg-surface)"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-(--text-primary)">
                    {plan.name}
                  </h3>
                  {plan.mostPopular && (
                    <Badge variant="secondary">Most popular</Badge>
                  )}
                </div>
                <p className="mt-1 text-lg font-medium text-(--text-primary)">
                  {formatPriceMonthly(plan.priceMonthlyCents)}/month
                </p>
                <p className="mt-2 text-xs text-(--text-muted)">
                  {plan.bestFor}
                </p>
                <ul className="mt-3 list-inside list-disc space-y-1 text-xs text-(--text-secondary)">
                  {plan.includes.slice(0, 5).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <ul className="mt-2 list-inside list-disc space-y-1 text-xs text-(--text-muted)">
                  {plan.limits.slice(0, 3).map((item, i) => (
                    <li key={i}>{item}</li>
                  ))}
                </ul>
                <div className="mt-4">
                  {isCurrent ? (
                    <button
                      type="button"
                      disabled
                      className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--muted) text-sm font-medium text-(--text-muted)"
                    >
                      Current plan
                    </button>
                  ) : canUpgrade ? (
                    <button
                      type="button"
                      onClick={() => handleSelectPlan(plan)}
                      className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-(--color-primary) text-sm font-medium text-white hover:bg-(--color-primary-hover)"
                    >
                      Upgrade
                    </button>
                  ) : canDowngrade ? (
                    <button
                      type="button"
                      onClick={() => handleSelectPlan(plan)}
                      title="Downgrades take effect at the end of your billing period."
                      className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
                    >
                      Downgrade (end of period)
                    </button>
                  ) : (
                    <span className="text-xs text-(--text-muted)">
                      {billingState.isPastDue || billingState.isSuspended
                        ? "Update payment method to change plan."
                        : "—"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>

      {/* Confirm plan change dialog — overlay close prevented to avoid accidental dismiss */}
      <Dialog
        open={confirmPlanOpen}
        onClose={closeConfirm}
        title="Confirm plan change"
        closeDisabled={scheduleLoading || checkoutLoading}
        allowOverlayClose={false}
      >
        {confirmTarget && (
          <div className="space-y-4">
            {confirmTarget.direction === "upgrade" ? (
              <>
                <p className="text-sm text-(--text-primary)">
                  You are upgrading to {confirmTarget.plan.name} —{" "}
                  {formatPriceMonthly(confirmTarget.plan.priceMonthlyCents)}
                  /month billed monthly. Upgrades apply immediately.
                </p>

                {taxValidationError && (
                  <Alert
                    variant="warning"
                    title="Tax identifier could not be validated"
                    description={taxValidationError}
                  >
                    <button
                      type="button"
                      onClick={() => handleConfirmUpgrade(true)}
                      disabled={checkoutLoading}
                      className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                    >
                      Continue without Tax ID
                    </button>
                  </Alert>
                )}

                {!taxValidationError && (
                  <div className="space-y-3">
                    <button
                      type="button"
                      onClick={() => setShowBillingDetails((v) => !v)}
                      className="text-sm font-medium text-(--color-primary) hover:underline"
                    >
                      {showBillingDetails ? "Hide billing details" : "Add billing address (optional)"}
                    </button>
                    {showBillingDetails && (
                      <div className="grid gap-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3 text-sm">
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label htmlFor="billing-country" className="mb-1 block text-(--text-muted)">
                              Country
                            </label>
                            <SearchableSelect
                              id="billing-country"
                              options={BILLING_COUNTRY_OPTIONS}
                              value={billingCountryCode}
                              onChange={setBillingCountryCode}
                              placeholder="Select country"
                              aria-label="Billing country"
                            />
                          </div>
                          <div>
                            <label htmlFor="billing-postal" className="mb-1 block text-(--text-muted)">
                              Postal code
                            </label>
                            <Input
                              id="billing-postal"
                              value={billingPostalCode}
                              onChange={(e) => setBillingPostalCode(e.target.value)}
                              placeholder="ZIP / postal code"
                            />
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div>
                            <label htmlFor="billing-region" className="mb-1 block text-(--text-muted)">
                              Region / State
                            </label>
                            <Input
                              id="billing-region"
                              value={billingRegion}
                              onChange={(e) => setBillingRegion(e.target.value)}
                              placeholder="State or region"
                            />
                          </div>
                          <div>
                            <label htmlFor="billing-city" className="mb-1 block text-(--text-muted)">
                              City
                            </label>
                            <Input
                              id="billing-city"
                              value={billingCity}
                              onChange={(e) => setBillingCity(e.target.value)}
                              placeholder="City"
                            />
                          </div>
                        </div>
                        <div>
                          <label htmlFor="billing-line1" className="mb-1 block text-(--text-muted)">
                            Address line 1
                          </label>
                          <Input
                            id="billing-line1"
                            value={billingFirstLine}
                            onChange={(e) => setBillingFirstLine(e.target.value)}
                            placeholder="Street address"
                          />
                        </div>
                        <div>
                          <label htmlFor="billing-line2" className="mb-1 block text-(--text-muted)">
                            Address line 2 (optional)
                          </label>
                          <Input
                            id="billing-line2"
                            value={billingSecondLine}
                            onChange={(e) => setBillingSecondLine(e.target.value)}
                            placeholder="Apt, suite, etc."
                          />
                        </div>
                        <div className="border-t border-(--border-subtle) pt-3">
                          <label className="flex cursor-pointer items-center gap-2">
                            <input
                              type="checkbox"
                              checked={businessToggle}
                              onChange={(e) => setBusinessToggle(e.target.checked)}
                              className="rounded border-(--border-subtle)"
                            />
                            <span className="text-(--text-primary)">Buying as a business (optional)</span>
                          </label>
                          {businessToggle && (
                            <div className="mt-3 space-y-2">
                              <div>
                                <label htmlFor="billing-company" className="mb-1 block text-(--text-muted)">
                                  Company name
                                </label>
                                <Input
                                  id="billing-company"
                                  value={companyName}
                                  onChange={(e) => setCompanyName(e.target.value)}
                                  placeholder="Company name"
                                />
                              </div>
                              <div>
                                <label htmlFor="billing-tax" className="mb-1 block text-(--text-muted)">
                                  Tax / VAT number (optional)
                                </label>
                                <Input
                                  id="billing-tax"
                                  value={taxIdentifier}
                                  onChange={(e) => setTaxIdentifier(e.target.value)}
                                  placeholder="VAT, GST, etc."
                                />
                                <p className="mt-1 text-xs text-(--text-muted)">
                                  Only required for VAT/GST regions; may not validate for some countries (e.g. Costa Rica). You can leave blank and continue.
                                </p>
                              </div>
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => handleConfirmUpgrade()}
                    disabled={checkoutLoading}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <>
                        <Spinner size="sm" />
                        Preparing secure checkout…
                      </>
                    ) : (
                      "Continue to checkout"
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={closeConfirm}
                    disabled={checkoutLoading}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            ) : (
              <>
                <p className="text-sm text-(--text-primary)">
                  You are downgrading to {confirmTarget.plan.name}. Downgrades take
                  effect at the end of the current billing period.
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmDowngrade}
                    disabled={scheduleLoading}
                    className="inline-flex h-9 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                  >
                    {scheduleLoading ? "Loading…" : "Schedule downgrade"}
                  </button>
                  <button
                    type="button"
                    onClick={closeConfirm}
                    disabled={scheduleLoading}
                    className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                  >
                    Cancel
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </Dialog>
    </div>
  );
}
