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

import { useSession } from "next-auth/react";
import { getCountryRule, isPostalCodeRequiredForCheckout } from "@/lib/billing/country-rules";
import { getCheckoutCountryOptions } from "@/lib/countries";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { IconAlertCircle } from "@/components/ui/icons";

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

/** Max lengths and messages aligned with checkout API validation. */
const CHECKOUT_FIELD_LIMITS: Record<string, { max: number; message: string }> = {
  contactName: { max: 200, message: "Contact name must be 200 characters or less." },
  contactEmail: { max: 191, message: "Email must be 191 characters or less." },
  billingCountryCode: { max: 2, message: "Please select your country." },
  billingPostalCode: { max: 20, message: "Postal code must be 20 characters or less." },
  billingRegion: { max: 80, message: "Region must be 80 characters or less." },
  billingCity: { max: 120, message: "City must be 120 characters or less." },
  billingFirstLine: { max: 200, message: "Address line 1 must be 200 characters or less." },
  billingSecondLine: { max: 200, message: "Address line 2 must be 200 characters or less." },
  companyName: { max: 200, message: "Company name must be 200 characters or less." },
  taxIdentifier: { max: 80, message: "Tax/VAT number must be 80 characters or less." },
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
  const [contactName, setContactName] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [checkoutValidationErrors, setCheckoutValidationErrors] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [showBillingAddress, setShowBillingAddress] = useState(false);
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
  const { data: session } = useSession();
  const apiFetch = useApiFetch();
  const toast = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const pathname = usePathname();

  const billingCountryOptions = getCheckoutCountryOptions();

  const getCurrentError = useCallback(
    (fieldKey: string): string | null => {
      const limits = CHECKOUT_FIELD_LIMITS[fieldKey];
      switch (fieldKey) {
        case "contactName": {
          if (!contactName.trim()) return "Contact name is required.";
          if (limits && contactName.length > limits.max) return limits.message;
          return null;
        }
        case "contactEmail": {
          if (!contactEmail.trim()) return "Contact email is required.";
          if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) return "Please enter a valid email address.";
          if (limits && contactEmail.length > limits.max) return limits.message;
          return null;
        }
        case "billingCountryCode":
          return !billingCountryCode?.trim() ? "Please select your country." : null;
        case "billingCity":
          if (limits && (billingCity?.length ?? 0) > limits.max) return limits.message;
          return null;
        case "billingFirstLine":
          if (limits && (billingFirstLine?.length ?? 0) > limits.max) return limits.message;
          return null;
        case "billingPostalCode": {
          if (!isPostalCodeRequiredForCheckout(billingCountryCode)) return null;
          if (!billingPostalCode?.trim()) return "Postal code is required for this country.";
          if (billingCountryCode?.trim()?.toUpperCase() === "US" && !/^\d{5}$/.test(billingPostalCode.trim()))
            return "US ZIP code must be 5 digits.";
          if (limits && (billingPostalCode?.length ?? 0) > limits.max) return limits.message;
          return null;
        }
        case "billingRegion":
          if (limits && (billingRegion?.length ?? 0) > limits.max) return limits.message;
          return null;
        case "billingSecondLine":
          if (limits && (billingSecondLine?.length ?? 0) > limits.max) return limits.message;
          return null;
        case "companyName": {
          if (!businessToggle) return null;
          if (!companyName?.trim()) return "Company name is required for business purchases.";
          if (limits && companyName.length > limits.max) return limits.message;
          return null;
        }
        case "taxIdentifier":
          if (limits && (taxIdentifier?.length ?? 0) > limits.max) return limits.message;
          return null;
        default:
          return null;
      }
    },
    [
      contactName,
      contactEmail,
      billingCountryCode,
      billingPostalCode,
      billingRegion,
      billingCity,
      billingFirstLine,
      billingSecondLine,
      showBillingAddress,
      businessToggle,
      companyName,
    ]
  );

  const showError = useCallback(
    (fieldKey: string) => {
      const error = checkoutValidationErrors[fieldKey] ?? getCurrentError(fieldKey);
      return (submitted || !!touched[fieldKey]) && !!error;
    },
    [submitted, touched, checkoutValidationErrors, getCurrentError]
  );

  const getErrorMessage = useCallback(
    (fieldKey: string): string | null => {
      const msg = checkoutValidationErrors[fieldKey] ?? getCurrentError(fieldKey);
      return (submitted || !!touched[fieldKey]) ? msg : null;
    },
    [submitted, touched, checkoutValidationErrors, getCurrentError]
  );

  const markTouched = useCallback((fieldKey: string) => {
    setTouched((prev) => ({ ...prev, [fieldKey]: true }));
  }, []);

  /** Clear API-originated error for a field when the user edits it so the message hides once the field is valid. */
  const clearCheckoutFieldError = useCallback((fieldKey: string) => {
    setCheckoutValidationErrors((prev) => {
      if (!(fieldKey in prev)) return prev;
      const next = { ...prev };
      delete next[fieldKey];
      return next;
    });
  }, []);

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

  /** Order of field IDs for scroll-to-first-error. */
  const CHECKOUT_FIELD_ORDER = [
    "checkout-contact-name",
    "checkout-contact-email",
    "billing-country",
    "billing-postal",
    "billing-region",
    "billing-city",
    "billing-line1",
    "billing-line2",
    "billing-company",
    "billing-tax",
  ] as const;

  const validateCheckout = useCallback((): { valid: boolean; errors: Record<string, string> } => {
    const err: Record<string, string> = {};
    if (!contactName.trim()) err.contactName = "Contact name is required.";
    else if ((CHECKOUT_FIELD_LIMITS.contactName?.max ?? 0) > 0 && contactName.length > CHECKOUT_FIELD_LIMITS.contactName.max)
      err.contactName = CHECKOUT_FIELD_LIMITS.contactName.message;

    if (!contactEmail.trim()) err.contactEmail = "Contact email is required.";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail.trim())) err.contactEmail = "Please enter a valid email address.";
    else if ((CHECKOUT_FIELD_LIMITS.contactEmail?.max ?? 0) > 0 && contactEmail.length > CHECKOUT_FIELD_LIMITS.contactEmail.max)
      err.contactEmail = CHECKOUT_FIELD_LIMITS.contactEmail.message;

    if (!billingCountryCode?.trim()) err.billingCountryCode = "Please select your country.";

    const hasAnyBillingField =
      !!(billingRegion?.trim() || billingCity?.trim() || billingFirstLine?.trim() || billingSecondLine?.trim());
    const billingSectionActive = showBillingAddress || hasAnyBillingField;

    if (isPostalCodeRequiredForCheckout(billingCountryCode) && !billingPostalCode?.trim()) err.billingPostalCode = "Postal code is required for this country.";
    else if (isPostalCodeRequiredForCheckout(billingCountryCode) && billingCountryCode?.trim()?.toUpperCase() === "US" && billingPostalCode?.trim() && !/^\d{5}$/.test(billingPostalCode.trim()))
      err.billingPostalCode = "US ZIP code must be 5 digits.";
    else if (isPostalCodeRequiredForCheckout(billingCountryCode) && (CHECKOUT_FIELD_LIMITS.billingPostalCode?.max ?? 0) > 0 && (billingPostalCode?.length ?? 0) > CHECKOUT_FIELD_LIMITS.billingPostalCode.max)
      err.billingPostalCode = CHECKOUT_FIELD_LIMITS.billingPostalCode.message;

    if (billingSectionActive) {
      if ((CHECKOUT_FIELD_LIMITS.billingCity?.max ?? 0) > 0 && (billingCity?.length ?? 0) > CHECKOUT_FIELD_LIMITS.billingCity.max)
        err.billingCity = CHECKOUT_FIELD_LIMITS.billingCity.message;
      if ((CHECKOUT_FIELD_LIMITS.billingFirstLine?.max ?? 0) > 0 && (billingFirstLine?.length ?? 0) > CHECKOUT_FIELD_LIMITS.billingFirstLine.max)
        err.billingFirstLine = CHECKOUT_FIELD_LIMITS.billingFirstLine.message;
      if ((CHECKOUT_FIELD_LIMITS.billingRegion?.max ?? 0) > 0 && (billingRegion?.length ?? 0) > CHECKOUT_FIELD_LIMITS.billingRegion.max)
        err.billingRegion = CHECKOUT_FIELD_LIMITS.billingRegion.message;
      if ((CHECKOUT_FIELD_LIMITS.billingSecondLine?.max ?? 0) > 0 && (billingSecondLine?.length ?? 0) > CHECKOUT_FIELD_LIMITS.billingSecondLine.max)
        err.billingSecondLine = CHECKOUT_FIELD_LIMITS.billingSecondLine.message;
    }

    if (businessToggle) {
      if (!companyName?.trim()) err.companyName = "Company name is required for business purchases.";
      else if ((CHECKOUT_FIELD_LIMITS.companyName?.max ?? 0) > 0 && companyName.length > CHECKOUT_FIELD_LIMITS.companyName.max)
        err.companyName = CHECKOUT_FIELD_LIMITS.companyName.message;
    }
    if ((CHECKOUT_FIELD_LIMITS.taxIdentifier?.max ?? 0) > 0 && (taxIdentifier?.length ?? 0) > CHECKOUT_FIELD_LIMITS.taxIdentifier.max)
      err.taxIdentifier = CHECKOUT_FIELD_LIMITS.taxIdentifier.message;

    setCheckoutValidationErrors(err);
    return { valid: Object.keys(err).length === 0, errors: err };
  }, [
    contactName,
    contactEmail,
    showBillingAddress,
    billingCountryCode,
    billingPostalCode,
    billingRegion,
    billingCity,
    billingFirstLine,
    billingSecondLine,
    businessToggle,
    companyName,
    taxIdentifier,
  ]);

  const errorKeyToFieldId: Record<string, string> = {
    contactName: "checkout-contact-name",
    contactEmail: "checkout-contact-email",
    billingCountryCode: "billing-country",
    billingPostalCode: "billing-postal",
    billingRegion: "billing-region",
    billingCity: "billing-city",
    billingFirstLine: "billing-line1",
    billingSecondLine: "billing-line2",
    companyName: "billing-company",
    taxIdentifier: "billing-tax",
  };

  const handleConfirmUpgrade = useCallback(
    async (skipTaxId?: boolean) => {
      if (!confirmTarget || confirmTarget.direction !== "upgrade") return;
      const result = validateCheckout();
      if (!skipTaxId && !result.valid) {
        setSubmitted(true);
        const firstErrorKey = CHECKOUT_FIELD_ORDER.find((id) => {
          const key = Object.keys(errorKeyToFieldId).find((k) => errorKeyToFieldId[k] === id);
          return key && result.errors[key];
        });
        const fieldId = firstErrorKey ?? (Object.keys(result.errors)[0] ? errorKeyToFieldId[Object.keys(result.errors)[0]] : null);
        const el = fieldId ? document.getElementById(fieldId) : null;
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" });
          if ("focus" in el && typeof (el as HTMLInputElement).focus === "function") (el as HTMLInputElement).focus();
        }
        return;
      }
      setTaxValidationError(null);
      setCheckoutValidationErrors({});
      setSubmitted(false);
      setCheckoutLoading(true);
      try {
        const billing = {
          address: {
            countryCode: billingCountryCode?.trim() ?? "",
            city: billingCity?.trim() ?? "",
            firstLine: billingFirstLine?.trim() ?? "",
            postalCode: billingPostalCode?.trim() || undefined,
            region: billingRegion?.trim() || undefined,
            secondLine: billingSecondLine?.trim() || undefined,
          },
          businessToggle: businessToggle && !!companyName.trim(),
          companyName: companyName.trim() || undefined,
          taxIdentifier: taxIdentifier.trim() || undefined,
        };
        const res = await apiFetch("/api/billing/paddle/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            planCode: confirmTarget.plan.code,
            contact: { name: contactName.trim(), email: contactEmail.trim() },
            billing,
            ...(skipTaxId && { skipTaxId: true }),
          }),
          showToastOnError: !skipTaxId,
        });
        const json = await res.json().catch(() => ({}));
        const errCode = (json as { details?: { code?: string }; error?: string }).details?.code;
        const errMessage = (json as { message?: string }).message;
        const fieldErrors = (json as { details?: { fields?: Record<string, string> } }).details?.fields;
        if (!res.ok && errCode === "TAX_IDENTIFIER_VALIDATION_FAILED") {
          setTaxValidationError(
            errMessage ?? "Tax identifier could not be validated for this country. You can continue without it."
          );
          return;
        }
        if (!res.ok && fieldErrors && Object.keys(fieldErrors).length > 0) {
          setCheckoutValidationErrors(fieldErrors);
          setSubmitted(true);
          const firstErrorKey = CHECKOUT_FIELD_ORDER.find((id) => {
            const key = Object.keys(errorKeyToFieldId).find((k) => errorKeyToFieldId[k] === id);
            return key ? fieldErrors[key] : false;
          });
          const fieldId =
            firstErrorKey ??
            (Object.keys(fieldErrors)[0] ? errorKeyToFieldId[Object.keys(fieldErrors)[0]] : null);
          const el = fieldId ? document.getElementById(fieldId) : null;
          if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            if ("focus" in el && typeof (el as HTMLInputElement).focus === "function")
              (el as HTMLInputElement).focus();
          }
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
      validateCheckout,
      contactName,
      contactEmail,
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
    setCheckoutValidationErrors({});
    setSubmitted(false);
    setTouched({});
    setShowBillingAddress(false);
  }, []);

  const loadBillingProfileForCheckout = useCallback(async () => {
    try {
      const res = await apiFetch("/api/billing/profile", { showToastOnError: false });
      if (!res.ok) return;
      const json = await res.json();
      const p = (json.data as { contactName?: string; contactEmail?: string; countryCode?: string; postalCode?: string; region?: string; city?: string; firstLine?: string; secondLine?: string; companyName?: string; taxIdentifier?: string; countryMismatch?: boolean } | null);
      if (p) {
        if (p.contactName != null && p.contactName.trim() !== "") setContactName(p.contactName);
        if (p.contactEmail != null && p.contactEmail.trim() !== "") setContactEmail(p.contactEmail);
        setBillingCountryCode(p.countryCode ?? "");
        setBillingPostalCode(p.postalCode ?? "");
        setBillingRegion(p.region ?? "");
        setBillingCity(p.city ?? "");
        setBillingFirstLine(p.firstLine ?? "");
        setBillingSecondLine(p.secondLine ?? "");
        setCompanyName(p.companyName ?? "");
        setTaxIdentifier(p.taxIdentifier ?? "");
        if ((p.companyName ?? "").trim()) setBusinessToggle(true);
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
    if (!confirmPlanOpen || confirmTarget?.direction !== "upgrade" || !session?.user) return;
    setContactName((prev) => prev.trim() || (session.user?.name ?? ""));
    setContactEmail((prev) => prev.trim() || (session.user?.email ?? ""));
  }, [confirmPlanOpen, confirmTarget?.direction, session?.user?.name, session?.user?.email]);

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
        title={
          confirmTarget?.direction === "upgrade"
            ? `Activate ${confirmTarget.plan.name} Plan`
            : "Confirm plan change"
        }
        closeDisabled={scheduleLoading || checkoutLoading}
        allowOverlayClose={false}
        contentClassName="max-h-[90vh] overflow-hidden flex flex-col max-w-md"
      >
        {confirmTarget && (
          <div className="overflow-y-auto overscroll-contain max-h-[calc(90vh-7rem)] -mx-6 px-6 pb-6">
          <div className="space-y-4">
            {confirmTarget.direction === "upgrade" ? (
              <>
                <p className="text-sm text-(--text-muted)">
                  You&apos;re upgrading to {confirmTarget.plan.name} —{" "}
                  {formatPriceMonthly(confirmTarget.plan.priceMonthlyCents)}
                  /month. You can update billing details anytime.
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
                    {/* 1) Contact details — required */}
                    <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3 text-sm">
                      <p className="mb-1 font-medium text-(--text-primary)">Contact details</p>
                      <p className="mb-3 text-xs text-(--text-muted)">
                        Used for receipts and account ownership.
                      </p>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <label htmlFor="checkout-contact-name" className="mb-1 block text-(--text-muted)">
                            Contact name <span className="ml-0.5 text-destructive">*</span>
                          </label>
                          <Input
                            id="checkout-contact-name"
                            value={contactName}
                            onChange={(e) => {
                              setContactName(e.target.value);
                              clearCheckoutFieldError("contactName");
                            }}
                            onBlur={() => markTouched("contactName")}
                            placeholder="Your name"
                            aria-invalid={showError("contactName")}
                            aria-describedby={showError("contactName") ? "checkout-contact-name-error" : undefined}
                            className={showError("contactName") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                          />
                          {showError("contactName") && (
                            <div id="checkout-contact-name-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                              <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                              <span>{getErrorMessage("contactName")}</span>
                            </div>
                          )}
                        </div>
                        <div>
                          <label htmlFor="checkout-contact-email" className="mb-1 block text-(--text-muted)">
                            Email <span className="ml-0.5 text-destructive">*</span>
                          </label>
                          <Input
                            id="checkout-contact-email"
                            type="email"
                            value={contactEmail}
                            onChange={(e) => {
                              setContactEmail(e.target.value);
                              clearCheckoutFieldError("contactEmail");
                            }}
                            onBlur={() => markTouched("contactEmail")}
                            placeholder="you@example.com"
                            aria-invalid={showError("contactEmail")}
                            aria-describedby={showError("contactEmail") ? "checkout-contact-email-error" : undefined}
                            className={showError("contactEmail") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                          />
                          {showError("contactEmail") && (
                            <div id="checkout-contact-email-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                              <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                              <span>{getErrorMessage("contactEmail")}</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* 2) Country and Postal code (postal on new line, shown/required only when country requires it) */}
                    <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3 text-sm">
                      <div>
                        <label htmlFor="billing-country" className="mb-1 block text-(--text-muted)">
                          Country <span className="ml-0.5 text-destructive">*</span>
                        </label>
                        <p className="mb-2 text-xs text-(--text-muted)">
                          Required to calculate taxes and VAT where applicable.
                        </p>
                        <SearchableSelect
                          id="billing-country"
                          options={billingCountryOptions}
                          value={billingCountryCode}
                          onChange={(v) => {
                            setBillingCountryCode(v);
                            clearCheckoutFieldError("billingCountryCode");
                            clearCheckoutFieldError("billingPostalCode");
                            markTouched("billingCountryCode");
                          }}
                          placeholder="Select country"
                          aria-label="Billing country"
                          className={showError("billingCountryCode") ? "[&_button]:border-destructive [&_button]:focus-visible:ring-2 [&_button]:focus-visible:ring-destructive/40" : ""}
                        />
                        {showError("billingCountryCode") && (
                          <div id="billing-country-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                            <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                            <span>{getErrorMessage("billingCountryCode")}</span>
                          </div>
                        )}
                      </div>
                      {isPostalCodeRequiredForCheckout(billingCountryCode) && (
                        <div className="mt-3">
                          <label htmlFor="billing-postal" className="mb-1 block text-(--text-muted)">
                            Postal code <span className="ml-0.5 text-destructive">*</span>
                          </label>
                          <Input
                            id="billing-postal"
                            value={billingPostalCode}
                            onChange={(e) => {
                              setBillingPostalCode(e.target.value);
                              clearCheckoutFieldError("billingPostalCode");
                            }}
                            onBlur={() => markTouched("billingPostalCode")}
                            placeholder={billingCountryCode?.trim()?.toUpperCase() === "US" ? "ZIP (5 digits)" : "ZIP / postal code"}
                            aria-invalid={showError("billingPostalCode")}
                            aria-describedby={showError("billingPostalCode") ? "billing-postal-error" : undefined}
                            className={showError("billingPostalCode") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                          />
                          {showError("billingPostalCode") && (
                            <div id="billing-postal-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                              <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                              <span>{getErrorMessage("billingPostalCode")}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* 3) Billing address — optional, collapsible (postal, region, city, line1, line2 only) */}
                    <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) text-sm">
                      <button
                        type="button"
                        onClick={() => setShowBillingAddress((v) => !v)}
                        className="flex w-full items-center justify-between p-3 text-left font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
                      >
                        {showBillingAddress ? "Hide billing address (optional)" : "Add billing address for invoices (optional)"}
                      </button>
                      {!showBillingAddress && (
                        <p className="border-t border-(--border-subtle) px-3 pb-3 pt-1 text-xs text-(--text-muted)">
                          Only needed if you want invoice details stored for this workspace.
                        </p>
                      )}
                      {showBillingAddress && (
                        <div className="border-t border-(--border-subtle) p-3">
                          <div className="grid gap-3">
                            <div>
                              <label htmlFor="billing-region" className="mb-1 block text-(--text-muted)">
                                Region / State
                              </label>
                                <Input
                                  id="billing-region"
                                  value={billingRegion}
                                  onChange={(e) => {
                                    setBillingRegion(e.target.value);
                                    clearCheckoutFieldError("billingRegion");
                                  }}
                                  onBlur={() => markTouched("billingRegion")}
                                  placeholder="State or region"
                                  aria-invalid={showError("billingRegion")}
                                  aria-describedby={showError("billingRegion") ? "billing-region-error" : undefined}
                                  className={showError("billingRegion") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                                />
                                {showError("billingRegion") && (
                                  <div id="billing-region-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                                    <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                                    <span>{getErrorMessage("billingRegion")}</span>
                                  </div>
                                )}
                            </div>
                            <div>
                              <label htmlFor="billing-city" className="mb-1 block text-(--text-muted)">
                                City
                              </label>
                              <Input
                                id="billing-city"
                                value={billingCity}
                                onChange={(e) => {
                                  setBillingCity(e.target.value);
                                  clearCheckoutFieldError("billingCity");
                                }}
                                onBlur={() => markTouched("billingCity")}
                                placeholder="City"
                                aria-invalid={showError("billingCity")}
                                aria-describedby={showError("billingCity") ? "billing-city-error" : undefined}
                                className={showError("billingCity") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                              />
                              {showError("billingCity") && (
                                <div id="billing-city-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                                  <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                                  <span>{getErrorMessage("billingCity")}</span>
                                </div>
                              )}
                            </div>
                            <div>
                              <label htmlFor="billing-line1" className="mb-1 block text-(--text-muted)">
                                Address line 1
                              </label>
                              <Input
                                id="billing-line1"
                                value={billingFirstLine}
                                onChange={(e) => {
                                  setBillingFirstLine(e.target.value);
                                  clearCheckoutFieldError("billingFirstLine");
                                }}
                                onBlur={() => markTouched("billingFirstLine")}
                                placeholder="Street address"
                                aria-invalid={showError("billingFirstLine")}
                                aria-describedby={showError("billingFirstLine") ? "billing-line1-error" : undefined}
                                className={showError("billingFirstLine") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                              />
                              {showError("billingFirstLine") && (
                                <div id="billing-line1-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                                  <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                                  <span>{getErrorMessage("billingFirstLine")}</span>
                                </div>
                              )}
                            </div>
                            <div>
                              <label htmlFor="billing-line2" className="mb-1 block text-(--text-muted)">
                                Address line 2
                              </label>
                              <Input
                                id="billing-line2"
                                value={billingSecondLine}
                                onChange={(e) => {
                                setBillingSecondLine(e.target.value);
                                clearCheckoutFieldError("billingSecondLine");
                              }}
                                onBlur={() => markTouched("billingSecondLine")}
                                placeholder="Apt, suite, etc."
                                aria-invalid={showError("billingSecondLine")}
                                aria-describedby={showError("billingSecondLine") ? "billing-line2-error" : undefined}
                                className={showError("billingSecondLine") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                              />
                              {showError("billingSecondLine") && (
                                <div id="billing-line2-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                                  <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                                  <span>{getErrorMessage("billingSecondLine")}</span>
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 4) Business details — optional, revealed by toggle */}
                    <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3 text-sm">
                      <label className="flex cursor-pointer items-start gap-2">
                        <input
                          type="checkbox"
                          checked={businessToggle}
                          onChange={(e) => setBusinessToggle(e.target.checked)}
                          className="mt-0.5 rounded border-(--border-subtle)"
                        />
                        <span className="font-medium text-(--text-primary)">Buying as a company? (optional)</span>
                      </label>
                      <p className="mt-1 text-xs text-(--text-muted)">
                        Add company details to include them on invoices and for VAT/GST where applicable.
                      </p>
                      {businessToggle && (
                        <div className="mt-3 space-y-3 border-t border-(--border-subtle) pt-3 transition-all duration-200 ease-out">
                          <div>
                            <label htmlFor="billing-company" className="mb-1 block text-(--text-muted)">
                              Company name <span className="ml-0.5 text-destructive">*</span>
                            </label>
                            <Input
                              id="billing-company"
                              value={companyName}
                              onChange={(e) => {
                              setCompanyName(e.target.value);
                              clearCheckoutFieldError("companyName");
                            }}
                              onBlur={() => markTouched("companyName")}
                              placeholder="Company name"
                              aria-invalid={showError("companyName")}
                              aria-describedby={showError("companyName") ? "billing-company-error" : undefined}
                              className={showError("companyName") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                            />
                            {showError("companyName") && (
                              <div id="billing-company-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                                <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                                <span>{getErrorMessage("companyName")}</span>
                              </div>
                            )}
                          </div>
                          <div>
                            <label htmlFor="billing-tax" className="mb-1 block text-(--text-muted)">
                              Tax / VAT number (optional)
                            </label>
                            <Input
                              id="billing-tax"
                              value={taxIdentifier}
                              onChange={(e) => {
                              setTaxIdentifier(e.target.value);
                              clearCheckoutFieldError("taxIdentifier");
                            }}
                              onBlur={() => markTouched("taxIdentifier")}
                              placeholder="VAT, GST, etc."
                              aria-invalid={showError("taxIdentifier")}
                              aria-describedby={showError("taxIdentifier") ? "billing-tax-error" : undefined}
                              className={showError("taxIdentifier") ? "border-destructive focus-visible:ring-2 focus-visible:ring-destructive/40" : undefined}
                            />
                            {showError("taxIdentifier") && (
                              <div id="billing-tax-error" role="alert" className="mt-1 flex items-start gap-1 text-xs text-destructive">
                                <IconAlertCircle className="mt-[2px] h-3.5 w-3.5 shrink-0" />
                                <span>{getErrorMessage("taxIdentifier")}</span>
                              </div>
                            )}
                            <p className="mt-1 text-xs text-muted-foreground">
                              Providing a VAT/GST number may remove local taxes where applicable.
                            </p>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-3">
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
                        "Continue to secure payment →"
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
                  <div className="flex flex-col items-center justify-center gap-1 border-t border-(--border-subtle) pt-3 text-center">
                    <p className="text-xs text-muted-foreground">
                      🔒 Secure payment powered by Paddle
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Invoices comply with international tax requirements where applicable.
                    </p>
                  </div>
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
          </div>
        )}
      </Dialog>
    </div>
  );
}
