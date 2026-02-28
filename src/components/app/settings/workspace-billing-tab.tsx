"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Script from "next/script";
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
import {
  IN_APP_PLAN_CATALOG,
  formatPriceMonthly,
  isUpgrade,
  isDowngrade,
  type PlanCode,
  type InAppPlanItem,
} from "@/lib/billing/plan-catalog";
import { useSession } from "next-auth/react";
import { IconEye } from "@/components/ui/icons";
import { BillingProfileSection } from "@/components/app/settings/billing-profile-section";

const PADDLE_SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";
const CHECKOUT_SUCCESS_REDIRECT =
  "/app/settings/workspace?tab=billing&billing=updated";

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
  enterprise: "Enterprise",
};

type BillingTransactionItem = {
  id: string;
  billedAt: string;
  status: string;
  total: { cents: number; currency: string };
  invoiceUrl?: string;
};

type PaymentMethodDisplay = {
  brand: string;
  last4: string;
  expiryMonth: number;
  expiryYear: number;
};

type ChangePlanPreview = {
  currentPlanCode: string;
  targetPlanCode: string;
  /** "immediate" = upgrade (prorated charge now; plan updates after webhook). "next_period" = downgrade (scheduled). */
  effectiveAt?: "immediate" | "next_period";
  effectiveFromDate: string | null;
  currentPeriodEnd: string | null;
  currency: string;
  nextPriceCents: number | null;
  requiresCheckout: boolean;
};

const CARD_BRAND_LABELS: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  american_express: "American Express",
  discover: "Discover",
};

function formatCardBrand(brand: string): string {
  return CARD_BRAND_LABELS[brand.toLowerCase()] ?? brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase();
}

/** Card brand icon (Visa, Mastercard, Amex, Discover) for payment method display. */
function CardBrandIcon({ brand, className }: { brand: string; className?: string }) {
  const key = brand.toLowerCase().replace(/\s+/g, "_");
  const normalized = key === "american_express" ? "amex" : key;
  const containerClassName = `flex h-10 w-14 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) ${className ?? ""}`;

  if (normalized === "visa") {
    return (
      <div className={containerClassName} aria-hidden title="Visa">
        <svg width={40} height={26} viewBox="0 0 40 26" fill="none">
          <rect width={40} height={26} rx={4} fill="#1A1F71" fillOpacity={0.15} />
          <text x={20} y={17} textAnchor="middle" fill="#1A1F71" fontSize={10} fontWeight="bold" fontFamily="system-ui, sans-serif">
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
          <path fill="#FF5F00" d="M25 7.3a8 8 0 000 11.4 8 8 0 010-11.4zM15 7.3a8 8 0 010 11.4 8 8 0 000-11.4z" />
        </svg>
      </div>
    );
  }
  if (normalized === "amex" || normalized === "american_express") {
    return (
      <div className={containerClassName} aria-hidden title="American Express">
        <svg width={40} height={26} viewBox="0 0 40 26" fill="none">
          <rect width={40} height={26} rx={4} fill="#006FCF" fillOpacity={0.15} />
          <text x={20} y={16} textAnchor="middle" fill="#006FCF" fontSize={7} fontWeight="bold" fontFamily="system-ui, sans-serif">
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
          <text x={20} y={16} textAnchor="middle" fill="#FF6000" fontSize={8} fontWeight="bold" fontFamily="system-ui, sans-serif">
            DISCOVER
          </text>
        </svg>
      </div>
    );
  }

  return (
    <div
      className={containerClassName}
      aria-hidden
      title={formatCardBrand(brand)}
    >
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

/** Derived UI state from summary (subscription state ? UI mapping). */
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
    hasPaidPlan: ["starter", "pro", "enterprise"].includes(summary.planCode),
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
  const [paymentMethodUpdateLoading, setPaymentMethodUpdateLoading] = useState(false);
  const [changePlanOpen, setChangePlanOpen] = useState(false);
  const [confirmPlanOpen, setConfirmPlanOpen] = useState(false);
  const [changePlanPreview, setChangePlanPreview] = useState<ChangePlanPreview | null>(null);
  const [confirmTarget, setConfirmTarget] = useState<{
    plan: InAppPlanItem;
    direction: "upgrade" | "downgrade";
  } | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<BillingTransactionItem[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDisplay | null | undefined>(undefined);
  const [paymentMethodLoading, setPaymentMethodLoading] = useState(false);
  const [paddleReady, setPaddleReady] = useState(false);
  const [postCheckoutState, setPostCheckoutState] = useState<
    "idle" | "polling" | "resolved" | "timeout"
  >("idle");
  const pollAttemptsRef = useRef(0);
  const postCheckoutPollStartedRef = useRef(false);
  const postCheckoutGotDataRef = useRef(false);
  const canceledToastShownRef = useRef(false);
  const { data: session } = useSession();
  const apiFetch = useApiFetch();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const pathname = usePathname();
  const clientToken =
    typeof process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN === "string"
      ? process.env.NEXT_PUBLIC_PADDLE_CLIENT_TOKEN.trim()
      : null;

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

  const [showAllActivity, setShowAllActivity] = useState(false);
  const fetchTransactions = useCallback(async () => {
    setTransactionsLoading(true);
    try {
      const filter = showAllActivity ? "all" : "completed";
      const res = await apiFetch(`/api/billing/transactions?filter=${filter}`, {
        showToastOnError: false,
      });
      if (!res.ok) {
        setTransactions([]);
        return;
      }
      const json = await res.json();
      const list = (json.data as { transactions?: BillingTransactionItem[] })?.transactions ?? [];
      setTransactions(Array.isArray(list) ? list : []);
    } catch {
      setTransactions([]);
    } finally {
      setTransactionsLoading(false);
    }
  }, [apiFetch, showAllActivity]);

  const fetchPaymentMethod = useCallback(async () => {
    setPaymentMethodLoading(true);
    try {
      const res = await apiFetch("/api/billing/paddle/payment-method", {
        showToastOnError: false,
      });
      if (!res.ok) {
        setPaymentMethod(null);
        return;
      }
      const json = await res.json();
      const pm = (json.data as { paymentMethod?: PaymentMethodDisplay | null })?.paymentMethod ?? null;
      setPaymentMethod(pm ?? null);
    } catch {
      setPaymentMethod(null);
    } finally {
      setPaymentMethodLoading(false);
    }
  }, [apiFetch]);

  const handlePaddleScriptLoad = useCallback(() => {
    const Paddle = typeof window !== "undefined" ? window.Paddle : undefined;
    if (!Paddle || !clientToken) {
      setPaddleReady(true);
      return;
    }
    try {
      if (clientToken.startsWith("test_") && Paddle.Environment?.set) {
        Paddle.Environment.set("sandbox");
      }
      Paddle.Initialize({
        token: clientToken,
        eventCallback: (data: { name?: string }) => {
          if (data.name === "checkout.completed") {
            window.location.href = CHECKOUT_SUCCESS_REDIRECT;
          }
          // checkout.closed: user closed overlay (e.g. X) ? do nothing, no redirect
        },
        checkout: {
          settings: {
            displayMode: "overlay",
            theme: "light",
            locale: "en",
            showAddTaxId: true,
          },
        },
      });
      setPaddleReady(true);
    } catch {
      setPaddleReady(true);
    }
  }, [clientToken]);

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
    if (!summary) return;
    fetchTransactions();
  }, [summary, fetchTransactions]);

  const shouldShowPaymentMethod =
    summary &&
    (summary.planCode === "starter" ||
      summary.planCode === "pro" ||
      summary.planCode === "enterprise" ||
      summary.subscriptionStatus.toUpperCase() === "PAST_DUE" ||
      summary.subscriptionStatus.toUpperCase() === "SUSPENDED");

  useEffect(() => {
    if (!shouldShowPaymentMethod) return;
    fetchPaymentMethod();
  }, [shouldShowPaymentMethod, fetchPaymentMethod]);

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
      if (!targetPlan && (plan === "starter" || plan === "pro" || plan === "enterprise") && status === "ACTIVE")
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
      (plan === "starter" || plan === "pro" || plan === "enterprise") &&
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

  const handleChangePaymentMethod = useCallback(async () => {
    setPaymentMethodUpdateLoading(true);
    try {
      const res = await apiFetch("/api/billing/paddle/update-payment-method-transaction", {
        method: "POST",
        showToastOnError: true,
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const transactionId = (json.data as { transactionId?: string })?.transactionId;
      if (!transactionId) {
        toast.addToast("error", "Could not open payment method update. Please try again.");
        return;
      }
      let defaultCountry: string | null = null;
      try {
        const geoRes = await apiFetch("/api/billing/geo-country");
        if (geoRes.ok) {
          const geoJson = await geoRes.json().catch(() => null);
          defaultCountry = (geoJson?.data as { countryCode?: string | null })?.countryCode ?? null;
        }
      } catch {
        // ignore; checkout still opens without prefilled country
      }
      const customerEmail = session?.user?.email?.trim();
      const Paddle = typeof window !== "undefined" ? (window as { Paddle?: { Checkout?: { open: (opts: { transactionId: string; settings?: { displayMode: string }; customer?: { email?: string; address?: { countryCode: string } } }) => void } } }).Paddle : undefined;
      if (Paddle?.Checkout?.open) {
        Paddle.Checkout.open({
          transactionId,
          settings: { displayMode: "overlay" },
          ...(defaultCountry && customerEmail
            ? { customer: { email: customerEmail, address: { countryCode: defaultCountry } } }
            : {}),
        });
      } else {
        toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
      }
    } finally {
      setPaymentMethodUpdateLoading(false);
    }
  }, [apiFetch, toast, session?.user?.email]);

  const handleSelectPlan = useCallback(
    async (plan: InAppPlanItem) => {
      const current = billingState.currentPlan;
      if (plan.code === current) return;
      if (isUpgrade(current, plan.code)) {
        setChangePlanOpen(false);
        setConfirmTarget({ plan, direction: "upgrade" });
        try {
          const res = await apiFetch(
            `/api/billing/change-plan/preview?targetPlanCode=${encodeURIComponent(plan.code)}`,
            { showToastOnError: false }
          );
          if (!res.ok) {
            toast.addToast("error", "Could not load plan preview.");
            return;
          }
          const json = await res.json().catch(() => ({}));
          const data = json.data as ChangePlanPreview | undefined;
          if (data) {
            setChangePlanPreview(data);
            setConfirmPlanOpen(true);
          }
        } catch {
          toast.addToast("error", "Could not load plan preview.");
        }
      } else if (isDowngrade(current, plan.code)) {
        setConfirmTarget({ plan, direction: "downgrade" });
        setChangePlanOpen(false);
        setConfirmPlanOpen(true);
      }
    },
    [billingState.currentPlan, apiFetch, toast]
  );

  const handleConfirmUpgrade = useCallback(
    async () => {
      if (!confirmTarget || confirmTarget.direction !== "upgrade") return;
      setCheckoutLoading(true);
      try {
        const res = await apiFetch("/api/billing/change-plan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            targetPlanCode: confirmTarget.plan.code,
            effective: "immediate",
          }),
          showToastOnError: true,
        });
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const data = json.data as { mode: string; effective?: string; transactionId?: string; environment?: string };
        setConfirmPlanOpen(false);
        setConfirmTarget(null);
        setChangePlanPreview(null);
        if (data.mode === "checkout" && data.transactionId) {
          try {
            sessionStorage.setItem("billing:postCheckoutPlan", confirmTarget.plan.code);
          } catch {
            // ignore
          }
          let defaultCountry: string | null = null;
          try {
            const geoRes = await apiFetch("/api/billing/geo-country");
            if (geoRes.ok) {
              const geoJson = await geoRes.json().catch(() => null);
              defaultCountry = (geoJson?.data as { countryCode?: string | null })?.countryCode ?? null;
            }
          } catch {
            // ignore; checkout still opens without prefilled country
          }
          const customerEmail = session?.user?.email?.trim();
          const Paddle = typeof window !== "undefined" ? (window as { Paddle?: { Checkout?: { open: (opts: { transactionId: string; settings?: { displayMode: string }; customer?: { email?: string; address?: { countryCode: string } } }) => void } } }).Paddle : undefined;
          if (Paddle?.Checkout?.open) {
            Paddle.Checkout.open({
              transactionId: data.transactionId,
              settings: { displayMode: "overlay" },
              ...(defaultCountry && customerEmail
                ? { customer: { email: customerEmail, address: { countryCode: defaultCountry } } }
                : {}),
            });
          } else {
            toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
          }
        } else {
          if (data.effective === "immediate") {
            toast.addToast("success", "Upgrade in progress. Your plan will update after payment is confirmed.");
          } else {
            toast.addToast("success", `Plan change to ${confirmTarget.plan.name} scheduled for next billing cycle.`);
          }
          await fetchSummary();
        }
      } finally {
        setCheckoutLoading(false);
      }
    },
    [confirmTarget, apiFetch, toast, fetchSummary, session?.user?.email]
  );

  const handleConfirmDowngrade = useCallback(async () => {
    if (!confirmTarget || confirmTarget.direction !== "downgrade") return;
    setScheduleLoading(true);
    try {
      const effective = confirmTarget.plan.code === "free" ? "next_period" : "next_period";
      const res = await apiFetch("/api/billing/change-plan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          targetPlanCode: confirmTarget.plan.code,
          effective,
        }),
        showToastOnError: true,
      });
      if (!res.ok) return;
      setConfirmPlanOpen(false);
      setConfirmTarget(null);
      toast.addToast("success", confirmTarget.plan.code === "free" ? "Downgrade scheduled." : "Plan change scheduled.");
      await fetchSummary();
    } finally {
      setScheduleLoading(false);
    }
  }, [confirmTarget, apiFetch, toast, fetchSummary]);

  const closeConfirm = useCallback(() => {
    setConfirmPlanOpen(false);
    setConfirmTarget(null);
    setChangePlanPreview(null);
  }, []);

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
      {clientToken && (
        <Script
          src={PADDLE_SCRIPT_URL}
          strategy="afterInteractive"
          onLoad={handlePaddleScriptLoad}
        />
      )}
      <div>
        <h2 className="text-base font-semibold text-(--text-primary)">
          Billing
        </h2>
        <p className="mt-0.5 text-sm text-(--text-secondary)">
          Plan, usage, and overage for the current billing period.
        </p>
      </div>

      {/* Post-checkout: setting up account (EPIC 4 n8n-style) */}
      {postCheckoutState === "polling" && (
        <Alert
          variant="info"
          title="Setting up account?"
          description="We're confirming your plan with the payment provider. This usually takes a few seconds."
        />
      )}
      {postCheckoutState === "timeout" && (
        <Alert variant="warning" title="Still processing your payment">
          <p className="mt-1">
            We&apos;re still processing your payment. Refresh in a moment to see the latest status.
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
          </div>
        </Alert>
      )}

      {/* Status banners: show when any plan change is scheduled (downgrade or cancel). Plan applies only after webhook confirmation. */}
      {summary.pendingPlanCode && (
        <Alert
          variant="info"
          title="Downgrade scheduled"
          description={`Downgrade scheduled for ${formatDate(summary.periodEnd)}. You'll keep your current plan until then.`}
        />
      )}
      {billingState.isPastDue && (
        <Alert
          variant="warning"
          title="Payment issue"
          description="Your subscription is past due. Update your payment method to avoid service interruption."
        >
          <button
            type="button"
            onClick={handleChangePaymentMethod}
            disabled={paymentMethodUpdateLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {paymentMethodUpdateLoading ? "Loading…" : "Update payment method"}
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
            onClick={handleChangePaymentMethod}
            disabled={paymentMethodUpdateLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) px-3 text-sm font-medium disabled:opacity-50"
          >
            {paymentMethodUpdateLoading ? "Loading…" : "Update payment method"}
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

      {/* Transaction history (EPIC 4/5) */}
      <CardRoot>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
              Payments
            </p>
            <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-secondary)">
              <input
                type="checkbox"
                checked={showAllActivity}
                onChange={(e) => setShowAllActivity(e.target.checked)}
                className="h-4 w-4 rounded border-(--border-subtle)"
              />
              Show all activity
            </label>
          </div>
        </CardHeader>
        <CardContent>
          {transactionsLoading ? (
            <Skeleton className="h-20 w-full" />
          ) : transactions.length === 0 ? (
            <p className="text-sm text-(--text-muted)">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--border-subtle)">
                    <th className="pb-2 pr-4 text-left font-medium text-(--text-muted)">Date</th>
                    <th className="pb-2 pr-4 text-left font-medium text-(--text-muted)">Status</th>
                    <th className="pb-2 pr-4 text-right font-medium text-(--text-muted)">Amount</th>
                    <th className="pb-2 text-right font-medium text-(--text-muted)"></th>
                  </tr>
                </thead>
                <tbody>
                  {transactions.map((t) => (
                    <tr key={t.id} className="border-b border-(--border-subtle)">
                      <td className="py-2 pr-4 text-(--text-primary)">{formatDate(t.billedAt)}</td>
                      <td className="py-2 pr-4 text-(--text-secondary)">{t.status}</td>
                      <td className="py-2 pr-4 text-right text-(--text-primary)">
                        {(t.total.cents / 100).toFixed(2)} {t.total.currency}
                      </td>
                      {/* EPIC 5: Payments are read-only. Only "View invoice"; no per-row "Edit billing details". */}
                      <td className="py-2 text-right">
                        {t.status?.toLowerCase() === "completed" ? (
                          <a
                            href={`/api/billing/transactions/${t.id}/invoice-redirect`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-sm text-(--color-primary) underline hover:no-underline"
                          >
                            <IconEye size={14} />
                            View invoice
                          </a>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </CardRoot>

      {/* Billing profile (tenant-level; future invoices only) */}
      <BillingProfileSection />

      {/* Payment method */}
      {(billingState.hasPaidPlan || billingState.isPastDue || billingState.isSuspended) && (
        <CardRoot>
          <CardHeader>
            <p className="text-xs font-medium uppercase tracking-wide text-(--text-muted)">
              Payment method
            </p>
          </CardHeader>
          <CardContent>
            {paymentMethodLoading ? (
              <Skeleton className="h-14 w-full max-w-sm" />
            ) : paymentMethod ? (
              <div className="flex items-start gap-3">
                <CardBrandIcon brand={paymentMethod.brand} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-(--text-primary)">
                    {formatCardBrand(paymentMethod.brand)} ending in {paymentMethod.last4}
                  </p>
                  <p className="mt-0.5 text-xs text-(--text-muted)">
                    Expires {formatExpiry(paymentMethod.expiryMonth, paymentMethod.expiryYear)}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-(--text-muted)">
                No payment method on file.
              </p>
            )}
            <button
              type="button"
              onClick={handleChangePaymentMethod}
              disabled={paymentMethodUpdateLoading}
              className="mt-3 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
            >
              {paymentMethodUpdateLoading ? "Loading…" : "Change payment method"}
            </button>
          </CardContent>
        </CardRoot>
      )}

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
                        : "?"}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </Dialog>

      {/* Confirm plan change dialog ? overlay close prevented to avoid accidental dismiss */}
      <Dialog
        open={confirmPlanOpen}
        onClose={closeConfirm}
        title="Confirm change"
        closeDisabled={scheduleLoading || checkoutLoading}
        allowOverlayClose={false}
        contentClassName="max-h-[90vh] overflow-hidden flex flex-col max-w-md"
      >
        {confirmTarget && (
          <div className="overflow-y-auto overscroll-contain max-h-[calc(90vh-7rem)] -mx-6 px-6 pb-6">
          <div className="space-y-4">
            {confirmTarget.direction === "upgrade" ? (
              <>
                <div className="text-sm text-(--text-primary) space-y-2">
                  <p>
                    <span className="text-(--text-muted)">Current plan: </span>
                    {PLAN_LABELS[changePlanPreview?.currentPlanCode ?? summary?.planCode ?? "free"] ?? (changePlanPreview?.currentPlanCode ?? summary?.planCode ?? "free")}
                  </p>
                  <p>
                    <span className="text-(--text-muted)">Target plan: </span>
                    {confirmTarget.plan.name}
                    {changePlanPreview?.nextPriceCents != null && (
                      <span className="text-(--text-muted)"> — {formatPriceMonthly(changePlanPreview.nextPriceCents)}/month</span>
                    )}
                  </p>
                  {changePlanPreview?.effectiveAt === "next_period" && changePlanPreview?.effectiveFromDate && (
                    <p>
                      <span className="text-(--text-muted)">Effective: </span>
                      {formatDate(changePlanPreview.effectiveFromDate)}
                    </p>
                  )}
                  <p className="text-(--text-muted)">
                    {changePlanPreview?.requiresCheckout
                      ? "You'll enter your payment details in the next step."
                      : changePlanPreview?.effectiveAt === "immediate"
                        ? "You'll be charged a prorated amount now. Your plan will update after payment is confirmed (same billing cycle)."
                        : "Your new amount will be charged at the end of the current billing cycle."}
                  </p>
                  {paymentMethod && !changePlanPreview?.requiresCheckout && (
                    <p className="text-(--text-muted)">
                      Payment method: {formatCardBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={handleConfirmUpgrade}
                    disabled={checkoutLoading}
                    className="inline-flex h-9 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                  >
                    {checkoutLoading ? (
                      <>
                        <Spinner size="sm" />
                        Preparing…
                      </>
                    ) : (
                      "Confirm"
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
                {/* REMOVED: old Activate plan form (EPIC 4) */}
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
          </div>
        )}
      </Dialog>
    </div>
  );
}
