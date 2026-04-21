"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Badge } from "@/components/ui/badge";
import { CardRoot, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { RECORD_CATEGORY_CONFIG } from "@/lib/record-category-config";
import {
  RECORD_PRIORITY_BADGE,
  RECORD_PRIORITY_LABELS,
  RECORD_TYPE_LABELS,
  formatAmount,
} from "@/lib/record-utils";
import { CURRENCY_OPTIONS } from "@/lib/currencies";
import type { RecordType } from "@/types/records";
import {
  IconAlertCircle,
  IconCheck,
  IconDollarSign,
  IconFileText,
  IconFilter,
  IconHelpCircle,
  IconSend,
} from "@/components/ui/icons";

const FINANCE_CATEGORIES: RecordType[] = [
  "BUDGET_REQUEST",
  "SPEND_APPROVAL",
  "VENDOR_PAYMENT_REQUEST",
  "REIMBURSEMENT",
  "FINANCIAL_EXCEPTION",
  "CONTRACT_SCOPE_CHANGE",
  "FORECAST_ADJUSTMENT",
  "OTHER_FINANCIAL_REQUEST",
];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  BUDGET_REQUEST: "Request funding for a new budget item",
  SPEND_APPROVAL: "Get approval for a specific spend",
  VENDOR_PAYMENT_REQUEST: "Request payment to a vendor or supplier",
  REIMBURSEMENT: "Request reimbursement for an expense",
  FINANCIAL_EXCEPTION: "Request an exception to financial policy",
  CONTRACT_SCOPE_CHANGE: "Amendment to a contract or scope with budget impact",
  FORECAST_ADJUSTMENT: "Adjust financial forecast or allocation",
  OTHER_FINANCIAL_REQUEST: "Any other financial request",
};

function selectCategoryAndScrollToTitle(
  setField: <K extends keyof FormDataState>(key: K, value: FormDataState[K]) => void,
  titleRef: RefObject<HTMLDivElement | null>,
  cat: RecordType
) {
  setField("category", cat);
  requestAnimationFrame(() => {
    titleRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  });
}

function CategoryIcon({
  type,
  size = 20,
}: {
  type: RecordType;
  size?: number;
}) {
  const common = "shrink-0 text-(--color-primary)";
  switch (type) {
    case "BUDGET_REQUEST":
      // Budget = money/funding
      return <IconDollarSign size={size} className={common} />;
    case "SPEND_APPROVAL":
      // Approval = checkmark
      return <IconCheck size={size} className={common} />;
    case "VENDOR_PAYMENT_REQUEST":
      // Sending payment to vendor
      return <IconSend size={size} className={common} />;
    case "REIMBURSEMENT":
      // Money being returned
      return <IconDollarSign size={size} className={common} />;
    case "FINANCIAL_EXCEPTION":
      // Exception = alert/warning
      return <IconAlertCircle size={size} className={common} />;
    case "CONTRACT_SCOPE_CHANGE":
      // Contract = document
      return <IconFileText size={size} className={common} />;
    case "FORECAST_ADJUSTMENT":
      // Adjustment = filter/tune
      return <IconFilter size={size} className={common} />;
    case "OTHER_FINANCIAL_REQUEST":
      // Generic/misc = help circle
      return <IconHelpCircle size={size} className={common} />;
    default:
      return <IconFileText size={size} className={common} />;
  }
}

export type CreateSuccessPayload = {
  id: string;
  title: string;
  status: "OPEN" | "DRAFT";
  recordKey: string | null;
  type: RecordType;
  requestedAmount: number | null;
  currencyCode: string | null;
};

type FormDataState = {
  category: RecordType | "";
  title: string;
  priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
  amount: string;
  currency: string;
  neededByDate: string;
  description: string;
  businessJustification: string;
  vendorName: string;
  payeeName: string;
  invoiceNumber: string;
  contractReference: string;
  purchaseOrderRef: string;
  costCenterId: string;
  departmentId: string;
  departmentName: string;
  policyExceptionReason: string;
  hasPolicyException: boolean;
  isRecurring: boolean;
  recurrenceNotes: string;
};

type FieldErrors = Partial<Record<string, string>>;

function initialForm(workspaceCurrency?: string): FormDataState {
  return {
    category: "",
    title: "",
    priority: "MEDIUM",
    amount: "",
    currency: workspaceCurrency ?? "USD",
    neededByDate: "",
    description: "",
    businessJustification: "",
    vendorName: "",
    payeeName: "",
    invoiceNumber: "",
    contractReference: "",
    purchaseOrderRef: "",
    costCenterId: "",
    departmentId: "",
    departmentName: "",
    policyExceptionReason: "",
    hasPolicyException: false,
    isRecurring: false,
    recurrenceNotes: "",
  };
}

function toIsoDate(val: string): string | null {
  const t = val.trim();
  if (!t) return null;
  const d = new Date(`${t}T12:00:00.000Z`);
  if (isNaN(d.getTime())) return null;
  const year = d.getUTCFullYear();
  if (year < 2020 || year > 2099) return null;
  return d.toISOString();
}

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: { code?: string };
  };
};

function isUpgradeRequired(data: ApiErrorBody): boolean {
  return data.error?.details?.code === "UPGRADE_REQUIRED";
}

export type FinanceRequestWizardProps = {
  variant: "page" | "modal";
  workspaceCurrency?: string;
  onStepChange?: (step: 1 | 2 | 3) => void;
  onSubmitSuccess: (payload: CreateSuccessPayload) => void;
  /** Called with the footer buttons JSX so the parent modal can render them in a fixed footer */
  onFooterChange?: (footer: ReactNode) => void;
};

export function FinanceRequestWizard({
  variant,
  workspaceCurrency,
  onStepChange,
  onSubmitSuccess,
  onFooterChange,
}: FinanceRequestWizardProps) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const topRef = useRef<HTMLDivElement>(null);
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormDataState>(() => initialForm(workspaceCurrency));
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [costCenters, setCostCenters] = useState<
    {
      id: string;
      code: string;
      name: string;
      departmentId: string;
      department: { id: string; name: string } | null;
    }[]
  >([]);
  const [loadingCostCenters, setLoadingCostCenters] = useState(false);

  const config = form.category ? RECORD_CATEGORY_CONFIG[form.category] : null;

  const costCenterOptions = useMemo(
    () =>
      costCenters.map((cc) => ({
        value: cc.id,
        label: `${cc.code} — ${cc.name}`,
      })),
    [costCenters]
  );

  const setField = useCallback(<K extends keyof FormDataState>(key: K, value: FormDataState[K]) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key as string];
      return next;
    });
    setGlobalError(null);
  }, []);

  const validateStep1 = useCallback((): FieldErrors => {
    const e: FieldErrors = {};
    if (!form.category) e.category = "Select a request category.";
    if (!form.title.trim()) e.title = "Title is required.";
    if (form.title.trim().length > 160) e.title = "Title must be 160 characters or less.";
    const c = form.category ? RECORD_CATEGORY_CONFIG[form.category] : null;
    if (c?.requiresAmount) {
      const n = Number(form.amount);
      if (!form.amount.trim() || Number.isNaN(n) || n <= 0) {
        e.amount = "Enter an amount greater than zero.";
      }
    }
    if (form.amount.trim()) {
      const n = Number(form.amount);
      if (Number.isNaN(n) || n < 0) e.amount = "Amount must be a valid non-negative number.";
      if (!/^[A-Z]{3}$/.test(form.currency.trim())) {
        e.currency = "Enter a 3-letter currency code (e.g. USD).";
      }
    }
    if (c?.requiresNeededByDate && !form.neededByDate.trim()) {
      e.neededByDate = "Needed-by date is required for this category.";
    }
    if (form.neededByDate.trim()) {
      const parsed = new Date(`${form.neededByDate.trim()}T12:00:00.000Z`);
      const year = parsed.getUTCFullYear();
      if (isNaN(parsed.getTime()) || year < 2020 || year > 2099) {
        e.neededByDate = "Please enter a valid date.";
      }
    }
    return e;
  }, [form]);

  const validateStep2 = useCallback((): FieldErrors => {
    const e: FieldErrors = {};
    const c = form.category ? RECORD_CATEGORY_CONFIG[form.category] : null;
    if (!c) return e;
    if (c.requiresBusinessJustification && !form.businessJustification.trim()) {
      e.businessJustification = "Business justification is required.";
    }
    if (form.category === "FINANCIAL_EXCEPTION" && !form.policyExceptionReason.trim()) {
      e.policyExceptionReason = "Policy exception details are required.";
    }
    if (c.showsPolicyException && form.category !== "FINANCIAL_EXCEPTION") {
      if (form.hasPolicyException && !form.policyExceptionReason.trim()) {
        e.policyExceptionReason = "Describe the policy exception.";
      }
    }
    if (form.description.length > 5000) e.description = "Max 5000 characters.";
    if (form.businessJustification.length > 2000)
      e.businessJustification = "Max 2000 characters.";
    return e;
  }, [form]);

  const scrollWizardToTop = useCallback(() => {
    setTimeout(() => {
      const root = topRef.current;
      const scrollParent = root?.closest(".overflow-y-auto") as HTMLElement | null;
      if (scrollParent) {
        scrollParent.scrollTo({ top: 0, behavior: "auto" });
      } else {
        root?.scrollIntoView({ behavior: "auto", block: "start" });
      }
    }, 0);
  }, []);

  const goNext = useCallback(() => {
    if (currentStep === 1) {
      const e = validateStep1();
      if (Object.keys(e).length) {
        setErrors(e);
        return;
      }
      setErrors({});
      setCurrentStep(2);
      scrollWizardToTop();
      return;
    }
    if (currentStep === 2) {
      const e = validateStep2();
      if (Object.keys(e).length) {
        setErrors(e);
        return;
      }
      setErrors({});
      setCurrentStep(3);
      scrollWizardToTop();
    }
  }, [currentStep, validateStep1, validateStep2, scrollWizardToTop]);

  const goBack = useCallback(() => {
    if (currentStep === 2) {
      setCurrentStep(1);
      scrollWizardToTop();
    } else if (currentStep === 3) {
      setCurrentStep(2);
      scrollWizardToTop();
    }
  }, [currentStep, scrollWizardToTop]);

  useEffect(() => {
    onStepChange?.(currentStep);
  }, [currentStep, onStepChange]);

  useEffect(() => {
    setLoadingCostCenters(true);
    apiFetch("/api/tenant/cost-centers?activeOnly=true", { showToastOnError: false })
      .then((r) => r.json())
      .then((json: { data?: { costCenters?: typeof costCenters } }) => {
        setCostCenters(json.data?.costCenters ?? []);
      })
      .catch(() => {})
      .finally(() => setLoadingCostCenters(false));
  }, [apiFetch]);

  const reviewMissing = useMemo(() => {
    const miss: string[] = [];
    const c = form.category ? RECORD_CATEGORY_CONFIG[form.category] : null;
    if (!form.category || !c) return ["Category"];
    if (!form.title.trim()) miss.push("Title");
    if (c.requiresAmount) {
      const n = Number(form.amount);
      if (!form.amount.trim() || Number.isNaN(n) || n <= 0) miss.push("Requested amount");
    }
    if (form.amount.trim() && !/^[A-Z]{3}$/.test(form.currency.trim())) miss.push("Currency");
    if (c.requiresNeededByDate && !form.neededByDate.trim()) miss.push("Needed by date");
    if (c.requiresBusinessJustification && !form.businessJustification.trim()) {
      miss.push("Business justification");
    }
    if (form.category === "FINANCIAL_EXCEPTION" && !form.policyExceptionReason.trim()) {
      miss.push("Policy exception reason");
    }
    if (c.showsPolicyException && form.hasPolicyException && !form.policyExceptionReason.trim()) {
      miss.push("Policy exception reason");
    }
    return miss;
  }, [form]);

  const canSubmitOpen = reviewMissing.length === 0;

  const submit = useCallback(async (status: "OPEN" | "DRAFT") => {
    if (status === "OPEN" && !canSubmitOpen) return;
    if (status === "DRAFT") setSavingDraft(true);
    else setSubmitting(true);
    setGlobalError(null);

    const c = form.category ? RECORD_CATEGORY_CONFIG[form.category] : null;
    if (!form.category || !c) {
      setGlobalError("Select a category.");
      setSavingDraft(false);
      setSubmitting(false);
      return;
    }

    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.category,
      priority: form.priority,
      visibility: "WORKSPACE",
      isSensitive: false,
      status,
    };

    if (form.description.trim()) body.description = form.description.trim();
    if (form.amount.trim()) {
      body.requestedAmount = Number(form.amount);
      body.currencyCode = form.currency.trim().toUpperCase();
    }
    if (form.businessJustification.trim())
      body.businessJustification = form.businessJustification.trim();
    if (form.vendorName.trim()) body.vendorName = form.vendorName.trim();
    if (form.payeeName.trim()) body.payeeName = form.payeeName.trim();
    if (form.invoiceNumber.trim()) body.invoiceNumber = form.invoiceNumber.trim();
    if (form.contractReference.trim()) body.contractReference = form.contractReference.trim();
    if (form.purchaseOrderRef.trim()) body.purchaseOrderRef = form.purchaseOrderRef.trim();
    if (form.costCenterId) body.costCenterId = form.costCenterId;
    if (form.departmentId) body.departmentId = form.departmentId;
    if (form.departmentName) body.departmentName = form.departmentName;
    const nd = toIsoDate(form.neededByDate);
    if (form.neededByDate.trim() && !nd) {
      setGlobalError("Please enter a valid needed-by date.");
      setSavingDraft(false);
      setSubmitting(false);
      return;
    }
    if (nd) body.neededByDate = nd;
    body.hasPolicyException =
      form.category === "FINANCIAL_EXCEPTION" || form.hasPolicyException;
    const per =
      form.category === "FINANCIAL_EXCEPTION"
        ? form.policyExceptionReason.trim()
        : form.hasPolicyException
          ? form.policyExceptionReason.trim()
          : "";
    if (per) body.policyExceptionReason = per;
    body.isRecurring = form.isRecurring;
    if (form.recurrenceNotes.trim()) body.recurrenceNotes = form.recurrenceNotes.trim();

    try {
      const res = await apiFetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      const payload = (await res.json().catch(() => ({}))) as ApiErrorBody & {
        data?: {
          id: string;
          title: string;
          status: string;
          recordKey?: string | null;
          type?: string;
          requestedAmount?: unknown;
          currencyCode?: string | null;
        };
      };

      if (res.status === 403 && isUpgradeRequired(payload)) {
        setGlobalError(
          "You've reached your plan's request limit. Upgrade to create more requests."
        );
        return;
      }
      if (res.status === 403) {
        setGlobalError(payload.error?.message ?? "Permission denied.");
        return;
      }
      if (!res.ok) {
        setGlobalError(payload.error?.message ?? "Something went wrong.");
        return;
      }
      const id = payload.data?.id;
      if (!id) {
        setGlobalError("Something went wrong.");
        return;
      }
      const reqAmtRaw = payload.data?.requestedAmount;
      let requestedAmount: number | null = null;
      if (reqAmtRaw != null && reqAmtRaw !== "") {
        const n = typeof reqAmtRaw === "number" ? reqAmtRaw : Number(reqAmtRaw);
        requestedAmount = Number.isFinite(n) ? n : null;
      }
      toast.addToast("success", status === "DRAFT" ? "Draft saved." : "Request created.");
      onSubmitSuccess({
        id,
        title: payload.data?.title ?? form.title.trim(),
        status,
        recordKey: payload.data?.recordKey ?? null,
        type: (payload.data?.type as RecordType) ?? form.category,
        requestedAmount,
        currencyCode: payload.data?.currencyCode ?? (form.amount.trim() ? form.currency : null),
      });
    } catch {
      setGlobalError("Network error. Please try again.");
    } finally {
      setSavingDraft(false);
      setSubmitting(false);
    }
  }, [canSubmitOpen, form, apiFetch, toast, onSubmitSuccess]);

  const isLoading = submitting || savingDraft;

  useEffect(() => {
    if (!onFooterChange) return;
    onFooterChange(
      <div className="flex w-full items-center justify-between gap-2">
        <div className="flex-shrink-0">
          {currentStep > 1 ? (
            <button
              type="button"
              onClick={goBack}
              disabled={isLoading}
              className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Back
            </button>
          ) : variant === "page" ? (
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={isLoading}
              className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
          ) : (
            <div />
          )}
        </div>

        <div className="flex flex-shrink-0 items-center gap-2">
          {currentStep < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={isLoading}
              className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Next
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void submit("DRAFT")}
                disabled={isLoading || !form.title.trim()}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:cursor-not-allowed disabled:opacity-60"
              >
                {savingDraft && <Spinner size="sm" />}
                {savingDraft ? "Saving…" : "Save as draft"}
              </button>
              <button
                type="button"
                onClick={() => void submit("OPEN")}
                disabled={isLoading || !canSubmitOpen}
                className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting && <Spinner size="sm" />}
                {submitting ? (
                  "Creating…"
                ) : (
                  <>
                    <span className="sm:hidden">Create</span>
                    <span className="hidden sm:inline">Create financial request</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    );
    return () => onFooterChange(null);
  }, [
    currentStep,
    isLoading,
    canSubmitOpen,
    savingDraft,
    submitting,
    goBack,
    goNext,
    submit,
    variant,
    form.title,
    onFooterChange,
  ]);

  const inner = (
    <div ref={topRef} className="space-y-6">
      {globalError && (
        <div className="rounded-lg border border-(--color-danger-soft) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)">
          {globalError}
        </div>
      )}

      {currentStep === 1 && (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-(--text-primary)">
              Request category <span className="text-(--color-danger)">*</span>
            </p>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {FINANCE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  disabled={isLoading}
                  onClick={() => selectCategoryAndScrollToTitle(setField, titleFieldRef, cat)}
                  className={[
                    "min-h-[auto] flex cursor-pointer gap-3 rounded-xl border p-3 text-left transition-colors disabled:cursor-not-allowed",
                    form.category === cat
                      ? "border-(--color-primary) bg-(--color-primary-soft)"
                      : "border-(--border-subtle) bg-(--bg-surface-elev) hover:bg-(--bg-surface-hover)",
                  ].join(" ")}
                >
                  <CategoryIcon type={cat} />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium text-(--text-primary)">
                      {RECORD_TYPE_LABELS[cat]}
                    </span>
                    <span className="mt-0.5 block text-xs text-(--text-muted)">
                      {CATEGORY_DESCRIPTIONS[cat]}
                    </span>
                  </span>
                </button>
              ))}
            </div>
            {errors.category && (
              <p className="mt-1 text-xs text-(--color-danger)">{errors.category}</p>
            )}
          </div>

          <div ref={titleFieldRef} className="space-y-1.5 scroll-mt-4">
            <label className="block text-sm font-medium text-(--text-primary)">
              Title <span className="text-(--color-danger)">*</span>
            </label>
            <Input
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder={
                config?.titlePlaceholder ?? "Short summary of this request"
              }
              maxLength={160}
              disabled={isLoading}
              className={errors.title ? "border-(--color-danger)" : ""}
            />
            <div className="flex justify-between">
              {errors.title ? (
                <p className="text-xs text-(--color-danger)">{errors.title}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-(--text-muted)">{form.title.length}/160</p>
            </div>
          </div>

          <div>
            <p className="mb-2 text-sm font-medium text-(--text-primary)">Priority</p>
            <div className="flex flex-wrap gap-2">
              {(["LOW", "MEDIUM", "HIGH", "URGENT"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  disabled={isLoading}
                  onClick={() => setField("priority", p)}
                  className={[
                    "cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed",
                    form.priority === p
                      ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary)"
                      : "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-secondary) hover:bg-(--bg-surface-hover)",
                  ].join(" ")}
                >
                  {RECORD_PRIORITY_LABELS[p]}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-(--text-primary)">
                  Requested amount
                  {config?.requiresAmount && (
                    <span className="text-(--color-danger)"> *</span>
                  )}
                  {!config?.requiresAmount && (
                    <span className="font-normal text-(--text-muted)"> (optional)</span>
                  )}
                </label>
                <Input
                  type="number"
                  min="0"
                  step="0.01"
                  value={form.amount}
                  onChange={(e) => setField("amount", e.target.value)}
                  placeholder="0.00"
                  disabled={isLoading}
                  className={errors.amount ? "border-(--color-danger)" : ""}
                />
                {errors.amount && (
                  <p className="text-xs text-(--color-danger)">{errors.amount}</p>
                )}
              </div>
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-(--text-primary)">
                  Currency
                  {(config?.requiresAmount || !!form.amount.trim()) && (
                    <span className="text-(--color-danger)"> *</span>
                  )}
                </label>
                <SearchableSelect
                  options={CURRENCY_OPTIONS}
                  value={form.currency}
                  onChange={(val) => setField("currency", val)}
                  placeholder="Select currency..."
                  disabled={isLoading}
                />
                {errors.currency && (
                  <p className="text-xs text-(--color-danger)">{errors.currency}</p>
                )}
              </div>
            </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-(--text-primary)">
              Needed by
              {config?.requiresNeededByDate && (
                <span className="text-(--color-danger)"> *</span>
              )}
              {!config?.requiresNeededByDate && (
                <span className="font-normal text-(--text-muted)"> (optional)</span>
              )}
            </label>
            <Input
              type="date"
              value={form.neededByDate}
              onChange={(e) => setField("neededByDate", e.target.value)}
              disabled={isLoading}
              min={new Date().toISOString().split("T")[0]}
              max="2099-12-31"
              className={errors.neededByDate ? "border-(--color-danger)" : ""}
            />
            {errors.neededByDate && (
              <p className="text-xs text-(--color-danger)">{errors.neededByDate}</p>
            )}
          </div>
        </div>
      )}

      {currentStep === 2 && config && (
        <div className="space-y-5">
          {config.visibleFields.includes("description") && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Description <span className="font-normal text-(--text-muted)">(optional)</span>
              </label>
              <Textarea
                value={form.description}
                onChange={(e) => setField("description", e.target.value)}
                rows={4}
                maxLength={5000}
                disabled={isLoading}
                placeholder="Additional context…"
              />
              <div className="flex justify-between text-xs text-(--text-muted)">
                {errors.description ? (
                  <span className="text-(--color-danger)">{errors.description}</span>
                ) : (
                  <span />
                )}
                <span>{form.description.length}/5000</span>
              </div>
            </div>
          )}

          {config.visibleFields.includes("businessJustification") && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Business justification
                {config.requiresBusinessJustification && (
                  <span className="text-(--color-danger)"> *</span>
                )}
              </label>
              <Textarea
                value={form.businessJustification}
                onChange={(e) => setField("businessJustification", e.target.value)}
                rows={3}
                maxLength={2000}
                disabled={isLoading}
                placeholder="Explain why this request is necessary and what it will be used for..."
                className={errors.businessJustification ? "border-(--color-danger)" : ""}
              />
              {errors.businessJustification && (
                <p className="text-xs text-(--color-danger)">{errors.businessJustification}</p>
              )}
            </div>
          )}

          {config.suggestsVendor && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Vendor / Supplier
              </label>
              <Input
                value={form.vendorName}
                onChange={(e) => setField("vendorName", e.target.value)}
                maxLength={160}
                disabled={isLoading}
              />
            </div>
          )}

          {config.visibleFields.includes("payeeName") && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Payee / Beneficiary
              </label>
              <Input
                value={form.payeeName}
                onChange={(e) => setField("payeeName", e.target.value)}
                maxLength={160}
                disabled={isLoading}
              />
            </div>
          )}

          {config.showsInvoiceNumber && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Invoice number
              </label>
              <Input
                value={form.invoiceNumber}
                onChange={(e) => setField("invoiceNumber", e.target.value)}
                maxLength={100}
                disabled={isLoading}
              />
            </div>
          )}

          {config.visibleFields.includes("contractReference") && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">
                Contract or PO reference
              </label>
              <Input
                value={form.contractReference}
                onChange={(e) => setField("contractReference", e.target.value)}
                maxLength={100}
                disabled={isLoading}
                placeholder="Contract ID or reference"
              />
            </div>
          )}

          {config.visibleFields.includes("purchaseOrderRef") &&
            !config.visibleFields.includes("contractReference") && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-(--text-primary)">
                  Contract or PO reference
                </label>
                <Input
                  value={form.purchaseOrderRef}
                  onChange={(e) => setField("purchaseOrderRef", e.target.value)}
                  maxLength={100}
                  disabled={isLoading}
                  placeholder="PO number"
                />
              </div>
            )}

          {(config.visibleFields.includes("costCenterCode") ||
            config.visibleFields.includes("departmentName")) && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-(--text-primary)">
                  Cost center
                  <span className="ml-1 text-xs font-normal text-(--text-muted)">(optional)</span>
                </label>
                {loadingCostCenters ? (
                  <div className="flex h-10 items-center gap-2 text-sm text-(--text-muted)">
                    <Spinner size="sm" />
                    Loading cost centers...
                  </div>
                ) : costCenterOptions.length === 0 ? (
                  <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm text-(--text-muted)">
                    No cost centers configured for this workspace yet.
                  </div>
                ) : (
                  <SearchableSelect
                    options={[{ value: "", label: "No cost center" }, ...costCenterOptions]}
                    value={form.costCenterId}
                    onChange={(val) => {
                      const selected = costCenters.find((cc) => cc.id === val);
                      setForm((f) => ({
                        ...f,
                        costCenterId: val,
                        departmentId: selected?.departmentId ?? "",
                        departmentName: selected?.department?.name ?? "",
                      }));
                      setErrors((prev) => {
                        const next = { ...prev };
                        delete next.costCenterId;
                        delete next.departmentId;
                        delete next.departmentName;
                        return next;
                      });
                      setGlobalError(null);
                    }}
                    placeholder="Search by code or name..."
                    disabled={isLoading}
                  />
                )}
              </div>

              {form.departmentName && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-(--text-muted) uppercase tracking-wide">
                    Department
                  </label>
                  <div className="flex items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5">
                    <span className="text-sm text-(--text-primary)">{form.departmentName}</span>
                    <span className="ml-auto text-xs text-(--text-muted)">Auto-filled</span>
                  </div>
                </div>
              )}
            </div>
          )}

          {form.category === "FINANCIAL_EXCEPTION" &&
            config.visibleFields.includes("policyExceptionReason") && (
              <div className="space-y-1.5">
                <label className="block text-sm font-medium text-(--text-primary)">
                  Policy exception details <span className="text-(--color-danger)">*</span>
                </label>
                <Textarea
                  value={form.policyExceptionReason}
                  onChange={(e) => setField("policyExceptionReason", e.target.value)}
                  maxLength={1000}
                  rows={3}
                  disabled={isLoading}
                  placeholder="Describe which policy is being excepted and why it is justified..."
                  className={errors.policyExceptionReason ? "border-(--color-danger)" : ""}
                />
                {errors.policyExceptionReason && (
                  <p className="text-xs text-(--color-danger)">{errors.policyExceptionReason}</p>
                )}
              </div>
            )}

          {config.showsPolicyException && form.category !== "FINANCIAL_EXCEPTION" && (
            <div className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
              <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
                <input
                  type="checkbox"
                  checked={form.hasPolicyException}
                  onChange={(e) => setField("hasPolicyException", e.target.checked)}
                  disabled={isLoading}
                  className="h-4 w-4 cursor-pointer rounded border-(--border-subtle) disabled:cursor-not-allowed"
                />
                This request requires a policy exception
              </label>
              {form.hasPolicyException && (
                <div className="space-y-1.5">
                  <label className="block text-xs font-medium text-(--text-primary)">
                    Policy exception reason <span className="text-(--color-danger)">*</span>
                  </label>
                  <Textarea
                    value={form.policyExceptionReason}
                    onChange={(e) => setField("policyExceptionReason", e.target.value)}
                    maxLength={1000}
                    rows={3}
                    disabled={isLoading}
                    placeholder="Describe which policy is being excepted and why it is justified..."
                    className={errors.policyExceptionReason ? "border-(--color-danger)" : ""}
                  />
                  {errors.policyExceptionReason && (
                    <p className="text-xs text-(--color-danger)">{errors.policyExceptionReason}</p>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="space-y-3 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
            <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
              <input
                type="checkbox"
                checked={form.isRecurring}
                onChange={(e) => setField("isRecurring", e.target.checked)}
                disabled={isLoading}
                className="h-4 w-4 cursor-pointer rounded border-(--border-subtle) disabled:cursor-not-allowed"
              />
              This is a recurring request
            </label>
            {form.isRecurring && (
              <Input
                value={form.recurrenceNotes}
                onChange={(e) => setField("recurrenceNotes", e.target.value)}
                placeholder="e.g. Monthly, quarterly…"
                maxLength={500}
                disabled={isLoading}
              />
            )}
          </div>
        </div>
      )}

      {currentStep === 3 && form.category && config && (
        <div className="space-y-4 rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) p-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{RECORD_TYPE_LABELS[form.category]}</Badge>
            <span className="text-sm font-semibold text-(--text-primary)">{form.title.trim()}</span>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge variant={RECORD_PRIORITY_BADGE[form.priority]}>{RECORD_PRIORITY_LABELS[form.priority]}</Badge>
          </div>
          {form.amount.trim() && (
            <p className="text-sm text-(--text-secondary)">
              {formatAmount(Number(form.amount), form.currency.trim() || "USD")}{" "}
              <span className="text-(--text-muted)">{form.currency.trim().toUpperCase()}</span>
            </p>
          )}
          {form.neededByDate && (
            <p className="text-sm text-(--text-secondary)">
              Needed by: <span className="text-(--text-primary)">{form.neededByDate}</span>
            </p>
          )}
          {form.businessJustification.trim() && (
            <p className="text-xs text-(--text-muted)">
              <span className="font-medium text-(--text-secondary)">Justification: </span>
              {form.businessJustification.trim().slice(0, 100)}
              {form.businessJustification.trim().length > 100 ? "…" : ""}
            </p>
          )}
          {(form.vendorName.trim() || form.payeeName.trim()) && (
            <p className="text-xs text-(--text-muted)">
              {form.vendorName.trim() && <>Vendor: {form.vendorName.trim()} · </>}
              {form.payeeName.trim() && <>Payee: {form.payeeName.trim()}</>}
            </p>
          )}
          {(form.hasPolicyException || form.category === "FINANCIAL_EXCEPTION") &&
            form.policyExceptionReason.trim() && (
              <p className="rounded-lg border border-(--color-warning-soft) bg-(--color-warning-soft) px-3 py-2 text-xs text-(--color-warning)">
                Policy exception: {form.policyExceptionReason.trim().slice(0, 120)}
                {form.policyExceptionReason.trim().length > 120 ? "…" : ""}
              </p>
            )}
          {!canSubmitOpen && (
            <p className="text-xs text-(--color-danger)">
              Missing required fields: {reviewMissing.join(", ")}
            </p>
          )}
        </div>
      )}

      {!onFooterChange && (
        <div className="border-t border-(--border-subtle) pt-4">
          <div className="flex w-full items-center justify-between gap-2">
            <div className="flex-shrink-0">
              {currentStep > 1 ? (
                <button
                  type="button"
                  onClick={goBack}
                  disabled={isLoading}
                  className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Back
                </button>
              ) : variant === "page" ? (
                <button
                  type="button"
                  onClick={() => window.history.back()}
                  disabled={isLoading}
                  className="inline-flex h-9 cursor-pointer items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Cancel
                </button>
              ) : (
                <div />
              )}
            </div>

            <div className="flex flex-shrink-0 items-center gap-2">
              {currentStep < 3 ? (
                <button
                  type="button"
                  onClick={goNext}
                  disabled={isLoading}
                  className="inline-flex h-9 cursor-pointer items-center rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Next
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => void submit("DRAFT")}
                    disabled={isLoading || !form.title.trim()}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {savingDraft && <Spinner size="sm" />}
                    {savingDraft ? "Saving…" : "Save as draft"}
                  </button>
                  <button
                    type="button"
                    onClick={() => void submit("OPEN")}
                    disabled={isLoading || !canSubmitOpen}
                    className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {submitting && <Spinner size="sm" />}
                    {submitting ? (
                      "Creating…"
                    ) : (
                      <>
                        <span className="sm:hidden">Create</span>
                        <span className="hidden sm:inline">Create financial request</span>
                      </>
                    )}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (variant === "page") {
    return (
      <CardRoot>
        <CardHeader>
          <h1 className="text-base font-semibold text-(--text-primary)">New financial request</h1>
          <p className="mt-0.5 text-sm text-(--text-muted)">
            Step through category, details, and review before submitting.
          </p>
        </CardHeader>
        <CardContent>{inner}</CardContent>
      </CardRoot>
    );
  }

  return <div className="px-1">{inner}</div>;
}

export function CreateRequestForm() {
  const router = useRouter();

  return (
    <FinanceRequestWizard
      variant="page"
      onSubmitSuccess={(p) => {
        router.push(`/app/requests/${p.id}`);
      }}
    />
  );
}
