"use client";

import { useEffect, useState, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import Script from "next/script";
import { Spinner } from "@/components/ui/spinner";
import { Skeleton } from "@/components/ui/skeleton";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { CardRoot, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
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
import { IconAlertCircle, IconEye, IconPencil } from "@/components/ui/icons";
import { BillingProfileSection } from "@/components/app/settings/billing-profile-section";
import { Input } from "@/components/ui/input";

const PADDLE_SCRIPT_URL = "https://cdn.paddle.com/paddle/v2/paddle.js";
const CHECKOUT_SUCCESS_REDIRECT = "/app/settings/workspace?tab=billing&billing=updated";

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

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  starter: "Starter",
  pro: "Pro",
  enterprise: "Enterprise",
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
  return (
    CARD_BRAND_LABELS[brand.toLowerCase()] ??
    brand.charAt(0).toUpperCase() + brand.slice(1).toLowerCase()
  );
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
  status: string,
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
): string {
  // Only show "Canceling" for scheduled cancellation to Free. Paid->paid downgrade shows "Active".
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
  if (s === "CANCELED") return "Canceled";
  return status;
}

const POLL_INTERVAL_MS = 2000;
const POLL_TIMEOUT_MS = 30000;
const MAX_POLL_ATTEMPTS = Math.floor(POLL_TIMEOUT_MS / POLL_INTERVAL_MS);

/** Actions menu for a single invoice row (••• dropdown). Rendered in a portal so it is not clipped by the card's overflow. */
function InvoiceRowActions({
  transaction,
  onViewInvoice,
  onEditBilling,
  onPaidInvoice,
}: {
  transaction: BillingTransactionItem;
  onViewInvoice: () => void;
  onEditBilling: () => void;
  onPaidInvoice?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ top: number; right: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const statusLower = transaction.status?.toLowerCase() ?? "";
  const isCompleted = statusLower === "completed";
  const isFailedOrPastDue = statusLower === "failed" || statusLower === "past_due";

  const updateMenuPosition = useCallback(() => {
    const btn = buttonRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    setMenuRect({ top: rect.top, right: rect.right });
  }, []);

  useEffect(() => {
    if (!open) {
      setMenuRect(null);
      return;
    }
    updateMenuPosition();
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (buttonRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      setOpen(false);
    };
    const handleScrollOrResize = () => updateMenuPosition();
    document.addEventListener("click", handleClickOutside, true);
    window.addEventListener("scroll", handleScrollOrResize, true);
    window.addEventListener("resize", handleScrollOrResize);
    return () => {
      document.removeEventListener("click", handleClickOutside, true);
      window.removeEventListener("scroll", handleScrollOrResize, true);
      window.removeEventListener("resize", handleScrollOrResize);
    };
  }, [open, updateMenuPosition]);

  return (
    <div className="relative inline-block">
      <button
        ref={buttonRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md text-(--text-muted) hover:bg-(--bg-surface-elev) hover:text-(--text-primary)"
        aria-label="Invoice actions"
        aria-expanded={open}
        aria-haspopup="menu"
      >
        <span className="text-base leading-none">•••</span>
      </button>
      {open &&
        menuRect != null &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            role="menu"
            className="fixed z-[100] min-w-[180px] rounded-lg border border-(--border-subtle) bg-(--bg-surface) py-1 shadow-lg"
            style={{
              bottom: `calc(100vh - ${menuRect.top}px + 4px)`,
              right: `calc(100vw - ${menuRect.right}px)`,
            }}
          >
            {isCompleted && (
              <>
                <button
                  type="button"
                  role="menuitem"
                  onClick={(e) => {
                    e.stopPropagation();
                    onViewInvoice();
                    setOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                >
                  <IconEye size={14} />
                  View invoice
                </button>
                {!transaction.isRevised && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={(e) => {
                      e.stopPropagation();
                      onEditBilling();
                      setOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
                  >
                    <IconPencil size={14} />
                    Edit billing details
                  </button>
                )}
              </>
            )}
            {isFailedOrPastDue && onPaidInvoice && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  onPaidInvoice();
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-(--text-primary) hover:bg-(--bg-surface-elev)"
              >
                Paid invoice
              </button>
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

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
  const [clearScheduledChangeLoading, setClearScheduledChangeLoading] = useState(false);
  const [paymentDeclinedModalOpen, setPaymentDeclinedModalOpen] = useState(false);
  const [paymentDeclinedPlanCode, setPaymentDeclinedPlanCode] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<BillingTransactionItem[]>([]);
  const [transactionsLoading, setTransactionsLoading] = useState(false);
  const [transactionsHasMore, setTransactionsHasMore] = useState(false);
  const transactionsScrollSentinelRef = useRef<HTMLTableRowElement>(null);
  const [editBillingTransactionId, setEditBillingTransactionId] = useState<string | null>(null);
  const [editBillingDetails, setEditBillingDetails] = useState<{
    invoiceNumber: string | null;
    billedAt: string | null;
    totalCents: number;
    currency: string;
    fullName: string;
    companyName: string | null;
    taxId: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
  } | null>(null);
  const [editBillingDetailsLoading, setEditBillingDetailsLoading] = useState(false);
  const [editBillingForm, setEditBillingForm] = useState({
    fullName: "",
    companyName: "",
    taxId: "",
    addressLine1: "",
    addressLine2: "",
    city: "",
    region: "",
  });
  const [editBillingSaving, setEditBillingSaving] = useState(false);
  const [editBillingSubmitError, setEditBillingSubmitError] = useState<string | null>(null);
  const [editBillingFieldErrors, setEditBillingFieldErrors] = useState<Record<string, string>>({});
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodDisplay | null | undefined>(
    undefined,
  );
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
          setError((data as { message?: string }).message ?? "Failed to load billing summary.");
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
    [apiFetch],
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
    [apiFetch, toast],
  );

  const TRANSACTIONS_PAGE_SIZE = 20;

  const [transactionsLoadingMore, setTransactionsLoadingMore] = useState(false);

  const fetchTransactions = useCallback(
    async (append: boolean = false) => {
      if (append) {
        setTransactionsLoadingMore(true);
      } else {
        setTransactionsLoading(true);
      }
      try {
        const offset = append ? transactions.length : 0;
        const res = await apiFetch(
          `/api/billing/transactions?filter=completed&limit=${TRANSACTIONS_PAGE_SIZE}&offset=${offset}`,
          { showToastOnError: false },
        );
        if (!res.ok) {
          if (!append) setTransactions([]);
          setTransactionsHasMore(false);
          return;
        }
        const json = await res.json();
        const data = json.data as {
          transactions?: BillingTransactionItem[];
          hasMore?: boolean;
        };
        const list = Array.isArray(data?.transactions) ? data.transactions : [];
        setTransactionsHasMore(Boolean(data?.hasMore));
        if (append) {
          setTransactions((prev) => [...prev, ...list]);
        } else {
          setTransactions(list);
        }
      } catch {
        if (!append) setTransactions([]);
        setTransactionsHasMore(false);
      } finally {
        if (append) {
          setTransactionsLoadingMore(false);
        } else {
          setTransactionsLoading(false);
        }
      }
    },
    [apiFetch, transactions.length],
  );

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
      { root: null, rootMargin: "120px", threshold: 0 },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [transactionsHasMore, transactionsLoading, transactionsLoadingMore, fetchTransactions]);

  const openEditBillingModal = useCallback(
    async (transactionId: string) => {
      setEditBillingTransactionId(transactionId);
      setEditBillingDetails(null);
      setEditBillingSubmitError(null);
      setEditBillingFieldErrors({});
      setEditBillingDetailsLoading(true);
      try {
        const res = await apiFetch(`/api/billing/paddle/transactions/${transactionId}`, {
          showToastOnError: true,
        });
        if (!res.ok) {
          setEditBillingTransactionId(null);
          return;
        }
        const json = await res.json();
        const d = json.data as {
          invoiceNumber?: string | null;
          billedAt?: string | null;
          totalCents?: number;
          currency?: string;
          fullName?: string;
          companyName?: string | null;
          taxId?: string | null;
          addressLine1?: string | null;
          addressLine2?: string | null;
          city?: string | null;
          region?: string | null;
        };
        setEditBillingDetails({
          invoiceNumber: d.invoiceNumber ?? null,
          billedAt: d.billedAt ?? null,
          totalCents: d.totalCents ?? 0,
          currency: d.currency ?? "USD",
          fullName: d.fullName ?? "",
          companyName: d.companyName ?? null,
          taxId: d.taxId ?? null,
          addressLine1: d.addressLine1 ?? null,
          addressLine2: d.addressLine2 ?? null,
          city: d.city ?? null,
          region: d.region ?? null,
        });
        setEditBillingForm({
          fullName: d.fullName ?? "",
          companyName: d.companyName ?? "",
          taxId: d.taxId ?? "",
          addressLine1: d.addressLine1 ?? "",
          addressLine2: d.addressLine2 ?? "",
          city: d.city ?? "",
          region: d.region ?? "",
        });
      } catch {
        setEditBillingTransactionId(null);
      } finally {
        setEditBillingDetailsLoading(false);
      }
    },
    [apiFetch],
  );

  const closeEditBillingModal = useCallback(() => {
    if (!editBillingSaving) {
      setEditBillingTransactionId(null);
      setEditBillingDetails(null);
      setEditBillingSubmitError(null);
      setEditBillingFieldErrors({});
    }
  }, [editBillingSaving]);

  const submitEditBilling = useCallback(async () => {
    if (!editBillingTransactionId) return;
    const fullName = editBillingForm.fullName.trim();
    if (!fullName) {
      setEditBillingFieldErrors((e) => ({ ...e, fullName: "Full name is required" }));
      return;
    }
    setEditBillingSaving(true);
    setEditBillingSubmitError(null);
    setEditBillingFieldErrors({});
    try {
      const cityAlreadyPresent = Boolean(editBillingDetails?.city?.trim());
      const regionAlreadyPresent = Boolean(editBillingDetails?.region?.trim());
      const res = await apiFetch(
        `/api/billing/paddle/transactions/${editBillingTransactionId}/revise`,
        {
          method: "POST",
          body: JSON.stringify({
            fullName,
            companyName: editBillingForm.companyName.trim() || null,
            taxId: editBillingForm.taxId.trim() || null,
            addressLine1: editBillingForm.addressLine1.trim() || null,
            addressLine2: editBillingForm.addressLine2.trim() || null,
            city: editBillingForm.city.trim() || null,
            region: editBillingForm.region.trim() || null,
            cityAlreadyPresent: cityAlreadyPresent || undefined,
            regionAlreadyPresent: regionAlreadyPresent || undefined,
          }),
          showToastOnError: false,
        },
      );
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = json.details as { fieldErrors?: Record<string, string> } | undefined;
        setEditBillingSubmitError((json.message as string) ?? "Failed to update billing details.");
        const raw = details?.fieldErrors ?? {};
        const fieldErrors: Record<string, string> = { ...raw };
        if (raw.tax_identifier != null && fieldErrors.taxId == null) {
          fieldErrors.taxId =
            typeof raw.tax_identifier === "string"
              ? raw.tax_identifier
              : String(raw.tax_identifier);
        }
        setEditBillingFieldErrors(fieldErrors);
        return;
      }
      toast.addToast("success", "Billing details updated for this invoice.");
      setEditBillingTransactionId(null);
      setEditBillingDetails(null);
      fetchTransactions();
    } catch {
      setEditBillingSubmitError("Failed to update billing details.");
    } finally {
      setEditBillingSaving(false);
    }
  }, [
    editBillingTransactionId,
    editBillingForm,
    editBillingDetails,
    apiFetch,
    toast,
    fetchTransactions,
  ]);

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
      const pm =
        (json.data as { paymentMethod?: PaymentMethodDisplay | null })?.paymentMethod ?? null;
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

    const retryPlan = ((): PlanCode | null => {
      try {
        const stored = sessionStorage.getItem("billing:retryUpgradePlan");
        if (stored === "starter" || stored === "pro" || stored === "enterprise")
          return stored as PlanCode;
      } catch {
        // ignore
      }
      return null;
    })();

    if (retryPlan) {
      (async () => {
        setLoading(true);
        try {
          const res = await apiFetch("/api/billing/change-plan", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ targetPlanCode: retryPlan, effective: "immediate" }),
            showToastOnError: true,
          });
          try {
            sessionStorage.removeItem("billing:retryUpgradePlan");
          } catch {
            // ignore
          }
          if (res.ok) {
            const planLabel = PLAN_LABELS[retryPlan] ?? retryPlan;
            toastRef.current.addToast("success", `Plan updated to ${planLabel}.`);
            await refetchBillingState(true);
            router.replace("/app/settings/workspace?tab=billing", { scroll: false });
          } else {
            const json = await res.json().catch(() => ({}));
            const msg =
              (json as { message?: string })?.message ??
              "Upgrade could not be applied. Please try again.";
            toastRef.current.addToast("error", msg);
            router.replace("/app/settings/workspace?tab=billing", { scroll: false });
          }
        } catch {
          toastRef.current.addToast("error", "Something went wrong. Please try again.");
          router.replace("/app/settings/workspace?tab=billing", { scroll: false });
        } finally {
          setLoading(false);
          postCheckoutPollStartedRef.current = false;
        }
      })();
      return;
    }

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
      if (
        !targetPlan &&
        (plan === "starter" || plan === "pro" || plan === "enterprise") &&
        status === "ACTIVE"
      )
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
  }, [billingParam, apiFetch, router, refetchBillingState]);

  // When summary already shows paid+active while polling (e.g. webhook beat us), transition to resolved so the banner hides
  useEffect(() => {
    if (billingParam !== "updated" || postCheckoutState !== "polling" || !summary) return;
    const plan = (summary.planCode?.toLowerCase() || "free") as PlanCode;
    const status = summary.subscriptionStatus?.toUpperCase() ?? "";
    if ((plan === "starter" || plan === "pro" || plan === "enterprise") && status === "ACTIVE") {
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
      const Paddle =
        typeof window !== "undefined"
          ? (
              window as {
                Paddle?: {
                  Checkout?: {
                    open: (opts: {
                      transactionId: string;
                      settings?: { displayMode: string };
                    }) => void;
                  };
                };
              }
            ).Paddle
          : undefined;
      if (Paddle?.Checkout?.open) {
        Paddle.Checkout.open({
          transactionId,
          settings: { displayMode: "overlay" },
        });
      } else {
        toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
      }
    } finally {
      setPaymentMethodUpdateLoading(false);
    }
  }, [toast]);

  const openPaidInvoiceCheckout = useCallback(
    async (providerTransactionId: string) => {
      const Paddle =
        typeof window !== "undefined"
          ? (
              window as {
                Paddle?: {
                  Checkout?: {
                    open: (opts: {
                      transactionId: string;
                      settings?: { displayMode: string };
                    }) => void;
                  };
                };
              }
            ).Paddle
          : undefined;
      if (Paddle?.Checkout?.open) {
        Paddle.Checkout.open({
          transactionId: providerTransactionId,
          settings: { displayMode: "overlay" },
        });
      } else {
        toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
      }
    },
    [toast],
  );

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
            { showToastOnError: false },
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
    [billingState.currentPlan, apiFetch, toast],
  );

  const handleConfirmUpgrade = useCallback(async () => {
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
      if (!res.ok) {
        const details = (json as { details?: { code?: string } })?.details;
        if (details?.code === "PAYMENT_DECLINED") {
          try {
            sessionStorage.setItem("billing:retryUpgradePlan", confirmTarget.plan.code);
          } catch {
            // ignore
          }
          setConfirmPlanOpen(false);
          setConfirmTarget(null);
          setChangePlanPreview(null);
          setPaymentDeclinedPlanCode(confirmTarget.plan.code);
          setPaymentDeclinedModalOpen(true);
        }
        return;
      }
      const data = json.data as {
        mode: string;
        effective?: string;
        transactionId?: string;
        environment?: string;
      };
      setConfirmPlanOpen(false);
      setConfirmTarget(null);
      setChangePlanPreview(null);
      if (data.mode === "checkout" && data.transactionId) {
        try {
          sessionStorage.setItem("billing:postCheckoutPlan", confirmTarget.plan.code);
        } catch {
          // ignore
        }
        const Paddle =
          typeof window !== "undefined"
            ? (
                window as {
                  Paddle?: {
                    Checkout?: {
                      open: (opts: {
                        transactionId: string;
                        settings?: { displayMode: string };
                      }) => void;
                    };
                  };
                }
              ).Paddle
            : undefined;
        if (Paddle?.Checkout?.open) {
          Paddle.Checkout.open({
            transactionId: data.transactionId,
            settings: { displayMode: "overlay" },
          });
        } else {
          toast.addToast("error", "Payment window could not open. Refresh the page and try again.");
        }
      } else {
        if (data.effective === "immediate") {
          toast.addToast(
            "success",
            "Upgrade in progress. Your plan will update after payment is confirmed.",
          );
        } else {
          toast.addToast(
            "success",
            `Plan change to ${confirmTarget.plan.name} scheduled for next billing cycle.`,
          );
        }
        await fetchSummary();
      }
    } finally {
      setCheckoutLoading(false);
    }
  }, [confirmTarget, apiFetch, toast, fetchSummary, session?.user?.email]);

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
      toast.addToast(
        "success",
        confirmTarget.plan.code === "free" ? "Downgrade scheduled." : "Plan change scheduled.",
      );
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

  const closePaymentDeclinedModal = useCallback(() => {
    setPaymentDeclinedModalOpen(false);
    setPaymentDeclinedPlanCode(null);
    try {
      sessionStorage.removeItem("billing:retryUpgradePlan");
    } catch {
      // ignore
    }
  }, []);

  const handlePaymentDeclinedUpdateMethod = useCallback(() => {
    setPaymentDeclinedModalOpen(false);
    handleChangePaymentMethod();
  }, [handleChangePaymentMethod]);

  const handleClearScheduledChange = useCallback(async () => {
    setClearScheduledChangeLoading(true);
    try {
      const res = await apiFetch("/api/billing/clear-scheduled-change", {
        method: "POST",
        showToastOnError: true,
      });
      if (!res.ok) return;
      const json = await res.json().catch(() => ({}));
      const data = json.data as { cleared?: boolean };
      if (data.cleared) {
        toast.addToast("success", "Scheduled change cleared. Your current plan will continue.");
        setChangePlanOpen(false);
        await fetchSummary();
      }
    } finally {
      setClearScheduledChangeLoading(false);
    }
  }, [apiFetch, toast, fetchSummary]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Manage your plan, invoices, and payment methods.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <CardRoot className="shadow-sm">
            <CardHeader>
              <Skeleton className="h-4 w-32" />
              <Skeleton className="mt-3 h-6 w-24" />
              <Skeleton className="mt-2 h-4 w-40" />
            </CardHeader>
            <CardFooter>
              <Skeleton className="h-9 w-28" />
            </CardFooter>
          </CardRoot>
          <CardRoot className="shadow-sm">
            <CardHeader>
              <Skeleton className="h-4 w-20" />
            </CardHeader>
            <CardContent>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="mt-2 h-2.5 w-full" />
            </CardContent>
          </CardRoot>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Manage your plan, invoices, and payment methods.
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
        <div>
          <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
          <p className="mt-1 text-sm text-(--text-secondary)">
            Manage your plan, invoices, and payment methods.
          </p>
        </div>
        <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-5 shadow-sm">
          <p className="text-sm text-(--text-muted)">
            No billing data available. Create or select a workspace with a plan to see usage.
          </p>
        </div>
      </div>
    );
  }

  const allowance = summary.included + summary.rolloverAvailable;
  const usagePct = allowance > 0 ? Math.min(100, (summary.used / allowance) * 100) : 0;
  const planLabel = PLAN_LABELS[summary.planCode] ?? summary.planCode;
  const primaryCtaLabel =
    billingState.isPastDue || billingState.isSuspended ? "Update payment method" : "Change plan";
  const showChangePlan = !billingState.isPastDue && !billingState.isSuspended;

  const nextChargeDate = summary?.periodEnd ? formatDate(summary.periodEnd) : null;
  const currentPlanItem = IN_APP_PLAN_CATALOG.find((p) => p.code === billingState.currentPlan);

  // Next invoice reflects scheduled downgrade or cancellation (not current plan when a change is scheduled)
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
      {clientToken && (
        <Script
          src={PADDLE_SCRIPT_URL}
          strategy="afterInteractive"
          onLoad={handlePaddleScriptLoad}
        />
      )}
      <div>
        <h2 className="text-lg font-semibold text-(--text-primary)">Billing overview</h2>
        <p className="mt-1 text-sm text-(--text-secondary)">
          Manage your plan, invoices, and payment methods.
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

      {/* Status banners: scheduled downgrade or cancellation */}
      {summary.pendingChangeType === "cancel_to_free_end_of_period" && (
        <Alert
          variant="info"
          title="Cancellation scheduled"
          description={`You'll move to Free on ${formatDate(summary.entitlementEffectiveUntil ?? summary.periodEnd)}. You can resume a paid plan whenever you want.`}
        >
          <button
            type="button"
            onClick={handleClearScheduledChange}
            disabled={clearScheduledChangeLoading}
            className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {clearScheduledChangeLoading ? (
              <>
                <Spinner size="sm" />
                Updating…
              </>
            ) : (
              "Resume my current plan"
            )}
          </button>
        </Alert>
      )}
      {summary.pendingChangeType === "downgrade_end_of_period" && summary.pendingPlanCode && (
        <Alert
          variant="info"
          title="Downgrade scheduled"
          description={`Downgrade scheduled to ${PLAN_LABELS[summary.pendingPlanCode] ?? summary.pendingPlanCode} on ${formatDate(summary.entitlementEffectiveUntil ?? summary.periodEnd)}. You'll keep ${PLAN_LABELS[summary.planCode] ?? summary.planCode} until then.`}
        >
          <button
            type="button"
            onClick={handleClearScheduledChange}
            disabled={clearScheduledChangeLoading}
            className="mt-2 inline-flex h-9 items-center justify-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {clearScheduledChangeLoading ? (
              <>
                <Spinner size="sm" />
                Updating…
              </>
            ) : (
              `Cancel schedule downgrade and keep the ${PLAN_LABELS[summary.planCode] ?? summary.planCode} plan`
            )}
          </button>
        </Alert>
      )}
      {summary.paymentStatus === "past_due" && (
        <Alert
          variant="warning"
          title="Payment failed"
          description={
            summary.graceEndsAt
              ? `We couldn't process your renewal payment. Update your payment method within 7 days to avoid interruption. Grace period ends on ${formatDate(summary.graceEndsAt)}.`
              : "We couldn't process your renewal payment. Update your payment method within 7 days to avoid interruption."
          }
        >
          <button
            type="button"
            onClick={handleChangePaymentMethod}
            disabled={paymentMethodUpdateLoading}
            className="mt-2 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            {paymentMethodUpdateLoading ? "Loading…" : "Change payment method"}
          </button>
        </Alert>
      )}
      {billingState.isPastDue && summary.paymentStatus !== "past_due" && (
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

      {/* Row 1: Plan & Subscription | Usage */}
      <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
        {/* Plan & Subscription */}
        <CardRoot className="relative overflow-hidden border border-(--border-strong) bg-(--bg-surface-elev) shadow-sm">
          <CardHeader className="pb-4">
            <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">
              Plan &amp; subscription
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <span className="text-2xl font-bold tracking-tight text-(--text-primary)">{planLabel} plan</span>
              <Badge
                variant={
                  billingState.isCancelingAtPeriodEnd &&
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
          <CardFooter className="flex flex-wrap items-center gap-2 border-t border-(--border-strong) bg-[color-mix(in_srgb,var(--color-bg-surface-elev)_50%,transparent)] pt-3">
            {showChangePlan && (
              <button
                type="button"
                onClick={handleOpenChangePlan}
                className="inline-flex h-9 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white shadow-sm ring-1 ring-inset ring-white/20 hover:bg-(--color-primary-hover)"
              >
                Change plan
              </button>
            )}
          </CardFooter>
        </CardRoot>

        {/* Usage */}
        <CardRoot className="shadow-sm">
          <CardHeader className="pb-3">
            <p className="text-xs font-semibold tracking-wider text-(--text-muted) uppercase">Usage this month</p>
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
      </div>

      {/* Row 2: Next Invoice | Payment Method — only when at least one is relevant */}
      {(billingState.hasPaidPlan && nextChargeDate) ||
      billingState.hasPaidPlan ||
      billingState.isPastDue ||
      billingState.isSuspended ? (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          {/* Next Invoice — reflects scheduled downgrade or cancellation; no charge when moving to Free */}
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
                      You&apos;re moving to Free on {nextChargeDate}. No charge after that.
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
                      Estimated total · {formatPriceMonthly(nextInvoiceTotalCents)}
                    </p>
                  </>
                )}
              </CardContent>
            </CardRoot>
          )}
          {/* Payment method */}
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
                          Expires{" "}
                          {formatExpiry(paymentMethod.expiryMonth, paymentMethod.expiryYear)}
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
                <button
                  type="button"
                  onClick={handleChangePaymentMethod}
                  disabled={paymentMethodUpdateLoading}
                  className="mt-4 inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                >
                  {paymentMethodUpdateLoading ? "Loading…" : "Change payment method"}
                </button>
              </CardContent>
            </CardRoot>
          )}
        </div>
      ) : null}

      {/* Row 3: Invoices — full width */}
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
                          <td className="px-4 py-3 text-right" data-invoice-action>
                            <InvoiceRowActions
                              transaction={t}
                              onViewInvoice={() =>
                                window.open(
                                  `/api/billing/transactions/${t.id}/invoice-redirect`,
                                  "_blank",
                                )
                              }
                              onEditBilling={() => openEditBillingModal(t.id)}
                              onPaidInvoice={
                                t.providerTransactionId
                                  ? () => openPaidInvoiceCheckout(t.providerTransactionId!)
                                  : undefined
                              }
                            />
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

      {/* Edit billing details (invoice-specific) modal */}
      <Dialog
        open={editBillingTransactionId != null}
        onClose={closeEditBillingModal}
        title="Edit billing details"
        description="Update customer and address for this invoice only."
        closeDisabled={editBillingSaving}
        allowOverlayClose={!editBillingSaving}
        contentClassName="max-w-md"
      >
        <div className="space-y-4">
          {editBillingDetailsLoading ? (
            <div className="flex items-center justify-center py-8">
              <Spinner className="h-8 w-8" />
            </div>
          ) : editBillingDetails ? (
            <>
              <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3 text-sm">
                <p className="font-medium text-(--text-primary)">Invoice summary</p>
                <p className="mt-1 text-(--text-secondary)">
                  {editBillingDetails.invoiceNumber
                    ? `Invoice ${editBillingDetails.invoiceNumber}`
                    : "Invoice"}
                  {editBillingDetails.billedAt
                    ? ` · ${formatDate(editBillingDetails.billedAt)}`
                    : ""}
                </p>
                <p className="mt-0.5 text-(--text-primary)">
                  {(editBillingDetails.totalCents / 100).toFixed(2)} {editBillingDetails.currency}
                </p>
              </div>
              {editBillingSubmitError && (
                <p className="text-sm text-(--color-danger)" role="alert">
                  {editBillingSubmitError}
                </p>
              )}
              <div className="grid gap-3">
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Full name
                  </label>
                  <Input
                    value={editBillingForm.fullName}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, fullName: e.target.value }))
                    }
                    placeholder="Required"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.fullName}
                    aria-describedby={
                      editBillingFieldErrors.fullName ? "edit-fullName-error" : undefined
                    }
                  />
                  {editBillingFieldErrors.fullName && (
                    <p
                      id="edit-fullName-error"
                      className="mt-1 text-xs text-(--color-danger)"
                    >
                      {editBillingFieldErrors.fullName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Company name
                  </label>
                  <Input
                    value={editBillingForm.companyName}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, companyName: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.companyName}
                  />
                  {editBillingFieldErrors.companyName && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.companyName}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Tax ID
                  </label>
                  <p className="mb-1.5 text-xs text-(--text-muted)">
                    Ensure the tax identifier matches the correct format for the customer&apos;s
                    country to ensure tax is calculated accurately.{" "}
                    <a
                      href="https://www.paddle.com/help/start/set-up-paddle/what-format-should-i-use-for-my-vat-id"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-(--color-primary) underline hover:no-underline"
                    >
                      Check valid formats
                    </a>
                  </p>
                  <Input
                    value={editBillingForm.taxId}
                    onChange={(e) => setEditBillingForm((f) => ({ ...f, taxId: e.target.value }))}
                    placeholder="Optional"
                    maxLength={64}
                    aria-invalid={!!editBillingFieldErrors.taxId}
                    aria-describedby={editBillingFieldErrors.taxId ? "edit-taxId-error" : undefined}
                  />
                  {editBillingFieldErrors.taxId && (
                    <p
                      id="edit-taxId-error"
                      className="mt-1 text-xs text-(--color-danger)"
                    >
                      {editBillingFieldErrors.taxId}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    First line of address
                  </label>
                  <Input
                    value={editBillingForm.addressLine1}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, addressLine1: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.addressLine1}
                  />
                  {editBillingFieldErrors.addressLine1 && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.addressLine1}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Second line of address
                  </label>
                  <Input
                    value={editBillingForm.addressLine2}
                    onChange={(e) =>
                      setEditBillingForm((f) => ({ ...f, addressLine2: e.target.value }))
                    }
                    placeholder="Optional"
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.addressLine2}
                  />
                  {editBillingFieldErrors.addressLine2 && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.addressLine2}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">City</label>
                  <Input
                    value={editBillingForm.city}
                    onChange={(e) => setEditBillingForm((f) => ({ ...f, city: e.target.value }))}
                    placeholder={editBillingDetails.city?.trim() ? undefined : "Optional"}
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.city}
                    disabled={!!editBillingDetails.city?.trim()}
                    readOnly={!!editBillingDetails.city?.trim()}
                    className={
                      editBillingDetails.city?.trim()
                        ? "cursor-not-allowed bg-(--muted)"
                        : undefined
                    }
                  />
                  {editBillingDetails.city?.trim() ? (
                    <p className="mt-1 text-xs text-(--text-muted)">
                      Cannot be changed for this invoice.
                    </p>
                  ) : null}
                  {editBillingFieldErrors.city && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.city}
                    </p>
                  )}
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-(--text-muted)">
                    Region / State
                  </label>
                  <Input
                    value={editBillingForm.region}
                    onChange={(e) => setEditBillingForm((f) => ({ ...f, region: e.target.value }))}
                    placeholder={editBillingDetails.region?.trim() ? undefined : "Optional"}
                    maxLength={255}
                    aria-invalid={!!editBillingFieldErrors.region}
                    disabled={!!editBillingDetails.region?.trim()}
                    readOnly={!!editBillingDetails.region?.trim()}
                    className={
                      editBillingDetails.region?.trim()
                        ? "cursor-not-allowed bg-(--muted)"
                        : undefined
                    }
                  />
                  {editBillingDetails.region?.trim() ? (
                    <p className="mt-1 text-xs text-(--text-muted)">
                      Cannot be changed for this invoice.
                    </p>
                  ) : null}
                  {editBillingFieldErrors.region && (
                    <p className="mt-1 text-xs text-(--color-danger)">
                      {editBillingFieldErrors.region}
                    </p>
                  )}
                </div>
              </div>
              <Alert variant="warning" className="text-sm font-medium">
                This invoice can only be edited once. Please review all fields before submitting.
              </Alert>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={closeEditBillingModal}
                  disabled={editBillingSaving}
                  className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={submitEditBilling}
                  disabled={editBillingSaving}
                  className="inline-flex items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50"
                >
                  {editBillingSaving ? (
                    <>
                      <Spinner className="h-4 w-4" />
                      Saving…
                    </>
                  ) : (
                    "Save changes"
                  )}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </Dialog>

      {/* Row 4: Billing profile (half) | optional placeholder */}
      {(billingState.hasPaidPlan || transactions.length > 0) && (
        <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
          <BillingProfileSection />
          {/* Billing contact placeholder — reserved for future use */}
        </div>
      )}

      {/* Change plan dialog */}
      {(() => {
        const scheduledCancellation = Boolean(
          summary.cancelAtPeriodEnd && summary.pendingPlanCode === "free",
        );
        const effectiveDateStr = summary.periodEnd ? formatDate(summary.periodEnd) : "";
        return (
          <Dialog
            open={changePlanOpen}
            onClose={() => setChangePlanOpen(false)}
            title="Change plan"
            description={
              scheduledCancellation
                ? `Subscription cancellation scheduled. Your workspace will move to the Free plan${effectiveDateStr ? ` on ${effectiveDateStr}` : " at the end of your billing period"}. You can resume a paid plan before that date.`
                : summary.pendingPlanCode && summary.pendingPlanCode !== "free"
                  ? "Compare plans. You have a scheduled downgrade; you can replace it with another plan below."
                  : "Compare plans and choose what fits your workspace. Upgrades apply immediately. Downgrades take effect at the end of your billing period."
            }
            contentClassName="max-w-6xl w-full"
          >
            {/* Plan cards: horizontal scroll only on small viewports; grid on md+ so no scroll on desktop */}
            <div className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto">
              <div className="overflow-x-auto px-4 pt-4 pb-2 sm:px-6 md:overflow-x-visible">
                <div className="flex min-w-max gap-4 md:grid md:min-w-0 md:auto-rows-fr md:grid-cols-2 lg:grid-cols-4">
                  {IN_APP_PLAN_CATALOG.map((plan) => {
                    const isCurrent = plan.code === billingState.currentPlan;
                    const isScheduled =
                      summary.pendingPlanCode &&
                      summary.pendingPlanCode !== "free" &&
                      plan.code === summary.pendingPlanCode;
                    const isScheduledFree = scheduledCancellation && plan.code === "free";
                    const canUpgrade =
                      isUpgrade(billingState.currentPlan, plan.code) &&
                      !billingState.isPastDue &&
                      !billingState.isSuspended;
                    const canDowngrade = isDowngrade(billingState.currentPlan, plan.code);
                    const hasScheduledDowngrade =
                      summary.pendingPlanCode && summary.pendingPlanCode !== "free";
                    const isOtherLowerWithScheduled =
                      hasScheduledDowngrade && canDowngrade && !isCurrent && !isScheduled;
                    const isResumePaidPlan =
                      scheduledCancellation && plan.code !== "free" && !isCurrent;
                    const effectiveDate = summary.periodEnd ? formatDate(summary.periodEnd) : "";
                    const buttonsDisabled = scheduleLoading || checkoutLoading;

                    return (
                      <div
                        key={plan.code}
                        className={`flex min-h-0 w-64 min-w-64 shrink-0 flex-col rounded-xl border p-4 md:w-auto md:min-w-0 ${
                          plan.mostPopular
                            ? "border-(--color-primary)/50 bg-(--bg-surface-elev)"
                            : "border-(--border-subtle) bg-(--bg-surface)"
                        }`}
                      >
                        <div className="min-h-0 flex-1">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="font-semibold text-(--text-primary)">{plan.name}</h3>
                            <div className="flex flex-wrap items-center justify-end gap-1.5">
                              {isCurrent && <Badge variant="secondary">Current</Badge>}
                              {(isScheduled || isScheduledFree) && (
                                <Badge variant="secondary">Scheduled</Badge>
                              )}
                              {plan.mostPopular &&
                                !isCurrent &&
                                !isScheduled &&
                                !isScheduledFree && <Badge variant="secondary">Most popular</Badge>}
                            </div>
                          </div>
                          <p className="mt-1 text-lg font-medium text-(--text-primary)">
                            {formatPriceMonthly(plan.priceMonthlyCents)}/month
                          </p>
                          {isCurrent &&
                            (hasScheduledDowngrade || scheduledCancellation) &&
                            effectiveDate && (
                              <p className="mt-1 text-xs text-(--text-muted)">
                                Current until {effectiveDate}
                              </p>
                            )}
                          {(isScheduled || isScheduledFree) && effectiveDate && (
                            <p className="mt-1 text-xs text-(--text-muted)">
                              Will become active on {effectiveDate}
                            </p>
                          )}
                          <p className="mt-2 text-xs text-(--text-muted)">{plan.bestFor}</p>
                          <ul className="mt-3 space-y-1.5 text-xs text-(--text-secondary)">
                            {plan.includes.slice(0, 5).map((item, i) => (
                              <li key={i} className="flex items-start gap-2">
                                <span
                                  className="mt-0.5 shrink-0 text-(--color-primary)"
                                  aria-hidden
                                >
                                  ✓
                                </span>
                                <span>{item}</span>
                              </li>
                            ))}
                          </ul>
                          {plan.limits.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs text-(--text-muted)">
                              {plan.limits.slice(0, 3).map((item, i) => (
                                <li key={i}>{item}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                        <div className="mt-auto shrink-0 pt-4">
                          <span
                            className="mb-4 block h-px w-full bg-(--border-subtle)"
                            aria-hidden
                          />
                          {isCurrent ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--muted) text-sm font-medium text-(--text-muted)"
                            >
                              Current plan
                            </button>
                          ) : isScheduled ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--muted) text-sm font-medium text-(--text-muted)"
                            >
                              Scheduled
                            </button>
                          ) : isScheduledFree ? (
                            <button
                              type="button"
                              disabled
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--muted) text-sm font-medium text-(--text-muted)"
                            >
                              Scheduled
                            </button>
                          ) : canUpgrade ? (
                            <button
                              type="button"
                              onClick={() => handleSelectPlan(plan)}
                              disabled={buttonsDisabled}
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg bg-(--color-primary) text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                            >
                              Upgrade
                            </button>
                          ) : isResumePaidPlan ? (
                            <>
                              <p className="mb-2 text-center text-xs text-(--text-muted)">
                                Replaces your scheduled cancellation.
                              </p>
                              <button
                                type="button"
                                onClick={() => handleSelectPlan(plan)}
                                disabled={buttonsDisabled}
                                title="Replaces your scheduled cancellation."
                                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                              >
                                Resume with this plan
                              </button>
                            </>
                          ) : isOtherLowerWithScheduled ? (
                            <>
                              {effectiveDate ? (
                                <p className="mb-2 text-center text-xs text-(--text-muted)">
                                  Replaces your scheduled downgrade. Effective on {effectiveDate}.
                                </p>
                              ) : null}
                              <button
                                type="button"
                                onClick={() => handleSelectPlan(plan)}
                                disabled={buttonsDisabled}
                                title="Replaces your scheduled downgrade."
                                className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
                              >
                                Schedule instead
                              </button>
                            </>
                          ) : canDowngrade && !scheduledCancellation ? (
                            <button
                              type="button"
                              onClick={() => handleSelectPlan(plan)}
                              disabled={buttonsDisabled}
                              title="Downgrades take effect at the end of your billing period."
                              className="inline-flex h-9 w-full items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-50"
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
              </div>
            </div>
          </Dialog>
        );
      })()}

      {/* Confirm plan change dialog — overlay close prevented to avoid accidental dismiss */}
      <Dialog
        open={confirmPlanOpen}
        onClose={closeConfirm}
        title={confirmTarget?.direction === "upgrade" ? "Confirm upgrade" : "Confirm change"}
        closeDisabled={scheduleLoading || checkoutLoading}
        allowOverlayClose={false}
        contentClassName="max-h-[90vh] overflow-hidden flex flex-col max-w-md"
      >
        {confirmTarget && (
          <div className="-mx-6 max-h-[calc(90vh-7rem)] overflow-y-auto overscroll-contain px-6 pb-6">
            <div className="space-y-4">
              {confirmTarget.direction === "upgrade" ? (
                <>
                  <div className="space-y-3 text-sm">
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">Current plan</p>
                      <p className="mt-0.5 font-medium text-(--text-primary)">
                        {PLAN_LABELS[
                          changePlanPreview?.currentPlanCode ?? summary?.planCode ?? "free"
                        ] ??
                          changePlanPreview?.currentPlanCode ??
                          summary?.planCode ??
                          "free"}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs font-medium text-(--text-muted)">New plan</p>
                      <p className="mt-0.5 font-medium text-(--text-primary)">
                        {confirmTarget.plan.name}
                        {changePlanPreview?.nextPriceCents != null && (
                          <span className="font-normal text-(--text-secondary)">
                            {" "}
                            — {formatPriceMonthly(changePlanPreview.nextPriceCents)}/month
                          </span>
                        )}
                      </p>
                    </div>
                    {changePlanPreview?.effectiveAt === "immediate" &&
                      changePlanPreview?.nextPriceCents != null && (
                        <div>
                          <p className="text-xs font-medium text-(--text-muted)">Due now</p>
                          <p className="mt-0.5 text-(--text-primary)">
                            {formatPriceMonthly(changePlanPreview.nextPriceCents)} (prorated)
                          </p>
                        </div>
                      )}
                    {changePlanPreview?.effectiveAt === "next_period" &&
                      changePlanPreview?.effectiveFromDate && (
                        <p className="text-(--text-muted)">
                          Effective {formatDate(changePlanPreview.effectiveFromDate)}.
                        </p>
                      )}
                    <p className="text-(--text-muted)">
                      {changePlanPreview?.requiresCheckout
                        ? "You'll enter your payment details in the next step."
                        : changePlanPreview?.effectiveAt === "immediate"
                          ? "Billing cycle remains the same. Your plan will update after payment is confirmed."
                          : "Your new amount will be charged at the end of the current billing cycle."}
                    </p>
                    {paymentMethod && !changePlanPreview?.requiresCheckout && (
                      <div>
                        <p className="text-xs font-medium text-(--text-muted)">Payment method</p>
                        <p className="mt-0.5 text-(--text-primary)">
                          {formatCardBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
                        </p>
                      </div>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2 pt-2">
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
                        `Upgrade to ${confirmTarget.plan.name}`
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
                    You are downgrading to {confirmTarget.plan.name}. Downgrades take effect at the
                    end of the current billing period.
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

      {/* Payment declined — UI only: layout, spacing, amber accent. No logic/handler changes. */}
      <Dialog
        open={paymentDeclinedModalOpen}
        onClose={closePaymentDeclinedModal}
        title={
          <span className="inline-flex items-center gap-2">
            <IconAlertCircle
              size={20}
              className="shrink-0 text-amber-600 dark:text-amber-500"
              aria-hidden
            />
            <span>Payment declined</span>
          </span>
        }
        contentClassName="max-w-md border-l-4 border-amber-500"
      >
        <div className="flex flex-col gap-5">
          {/* Amber alert banner — presentational only */}
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800 dark:border-amber-800/50 dark:bg-amber-950/30 dark:text-amber-200">
            <p className="font-medium">
              Payment could not be processed. Update your payment method to continue.
            </p>
          </div>

          {/* Context: card brand + last4 emphasized */}
          <p className="text-sm text-(--text-primary)">
            {paymentMethod ? (
              <>
                Your{" "}
                <span className="font-medium text-(--text-primary)">
                  {formatCardBrand(paymentMethod.brand)} •••• {paymentMethod.last4}
                </span>{" "}
                was declined while attempting to upgrade your workspace.
              </>
            ) : (
              <>Your card was declined while attempting to upgrade your workspace.</>
            )}
          </p>

          {/* Upgrade plan — existing data, neutral info card */}
          {paymentDeclinedPlanCode && (
            <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-3">
              <p className="text-xs font-medium tracking-wide text-(--text-muted) uppercase">
                Upgrade plan
              </p>
              <p className="mt-1.5 text-sm font-semibold text-(--text-primary)">
                {PLAN_LABELS[paymentDeclinedPlanCode] ?? paymentDeclinedPlanCode} —{" "}
                {(() => {
                  const plan = IN_APP_PLAN_CATALOG.find((p) => p.code === paymentDeclinedPlanCode);
                  return plan ? formatPriceMonthly(plan.priceMonthlyCents) + "/month" : "";
                })()}
              </p>
            </div>
          )}

          {/* Possible reasons — neutral tone, clean spacing */}
          <div>
            <p className="text-xs font-medium text-(--text-muted)">Possible reasons</p>
            <ul className="mt-2 list-inside list-disc space-y-1 text-sm leading-relaxed text-(--text-secondary)">
              <li>Insufficient funds</li>
              <li>Card expired</li>
              <li>Bank blocked the transaction</li>
            </ul>
          </div>

          {/* Primary instruction */}
          <p className="text-sm font-medium text-(--text-primary)">
            Please update your payment method to continue.
          </p>

          {/* Reassurance — smaller, muted */}
          <p className="text-xs text-(--text-muted)">
            Your upgrade will resume automatically after updating your payment method.
          </p>

          {/* Buttons: same handlers, no logic change. Spacing and visual hierarchy only. */}
          <div className="flex flex-wrap items-center gap-3 pt-1">
            <button
              type="button"
              onClick={handlePaymentDeclinedUpdateMethod}
              disabled={paymentMethodUpdateLoading}
              className="inline-flex h-9 min-w-36 items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) focus:ring-2 focus:ring-(--color-primary) focus:ring-offset-2 focus:outline-none disabled:opacity-50"
            >
              {paymentMethodUpdateLoading ? (
                <>
                  <Spinner size="sm" />
                  Opening…
                </>
              ) : (
                "Update payment method"
              )}
            </button>
            <button
              type="button"
              onClick={closePaymentDeclinedModal}
              className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) focus:ring-2 focus:ring-(--border-subtle) focus:ring-offset-2 focus:outline-none"
            >
              Cancel
            </button>
          </div>
        </div>
      </Dialog>
    </div>
  );
}
