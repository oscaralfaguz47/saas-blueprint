"use client";

import { useCallback, useMemo, useRef, useState, type RefObject } from "react";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { Badge } from "@/components/ui/badge";
import { CardRoot, CardHeader, CardContent, CardFooter } from "@/components/ui/card";
import { RECORD_CATEGORY_CONFIG } from "@/lib/record-category-config";
import {
  RECORD_PRIORITY_BADGE,
  RECORD_PRIORITY_LABELS,
  RECORD_TYPE_LABELS,
  formatAmount,
} from "@/lib/record-utils";
import type { RecordType } from "@/types/records";
import {
  IconBilling,
  IconFileText,
  IconDollarSign,
  IconClock,
  IconAlertCircle,
  IconWorkspace,
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

const LEGACY_CATEGORIES: RecordType[] = ["SCOPE_CHANGE", "DECISION", "BUDGET"];

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  BUDGET_REQUEST: "Request funding for a new budget item",
  SPEND_APPROVAL: "Get approval for a specific spend",
  VENDOR_PAYMENT_REQUEST: "Request payment to a vendor or supplier",
  REIMBURSEMENT: "Request reimbursement for an expense",
  FINANCIAL_EXCEPTION: "Request an exception to financial policy",
  CONTRACT_SCOPE_CHANGE: "Amendment to a contract or scope with budget impact",
  FORECAST_ADJUSTMENT: "Adjust financial forecast or allocation",
  OTHER_FINANCIAL_REQUEST: "Any other financial request",
  BUDGET: "Budget request",
  SCOPE_CHANGE: "Scope change",
  DECISION: "Decision request",
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

function CategoryIcon({ type, size = 20 }: { type: RecordType; size?: number }) {
  const common = "shrink-0 text-(--color-primary)";
  switch (type) {
    case "BUDGET_REQUEST":
    case "FORECAST_ADJUSTMENT":
      return <IconBilling size={size} className={common} />;
    case "SPEND_APPROVAL":
    case "VENDOR_PAYMENT_REQUEST":
      return <IconDollarSign size={size} className={common} />;
    case "REIMBURSEMENT":
      return <IconClock size={size} className={common} />;
    case "FINANCIAL_EXCEPTION":
      return <IconAlertCircle size={size} className={common} />;
    case "CONTRACT_SCOPE_CHANGE":
      return <IconFileText size={size} className={common} />;
    case "OTHER_FINANCIAL_REQUEST":
      return <IconWorkspace size={size} className={common} />;
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
  departmentName: string;
  costCenterCode: string;
  policyExceptionReason: string;
  hasPolicyException: boolean;
  isRecurring: boolean;
  recurrenceNotes: string;
};

type FieldErrors = Partial<Record<string, string>>;

function initialForm(): FormDataState {
  return {
    category: "",
    title: "",
    priority: "MEDIUM",
    amount: "",
    currency: "USD",
    neededByDate: "",
    description: "",
    businessJustification: "",
    vendorName: "",
    payeeName: "",
    invoiceNumber: "",
    contractReference: "",
    purchaseOrderRef: "",
    departmentName: "",
    costCenterCode: "",
    policyExceptionReason: "",
    hasPolicyException: false,
    isRecurring: false,
    recurrenceNotes: "",
  };
}

function toIsoDate(d: string): string | undefined {
  const t = d.trim();
  if (!t) return undefined;
  return `${t}T12:00:00.000Z`;
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
  onSubmitSuccess: (payload: CreateSuccessPayload) => void;
};

export function FinanceRequestWizard({ variant, onSubmitSuccess }: FinanceRequestWizardProps) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const titleFieldRef = useRef<HTMLDivElement>(null);
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);
  const [form, setForm] = useState<FormDataState>(initialForm);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const config = form.category ? RECORD_CATEGORY_CONFIG[form.category] : null;

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

  function goNext() {
    if (currentStep === 1) {
      const e = validateStep1();
      if (Object.keys(e).length) {
        setErrors(e);
        return;
      }
      setErrors({});
      setCurrentStep(2);
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
    }
  }

  function goBack() {
    if (currentStep === 2) setCurrentStep(1);
    else if (currentStep === 3) setCurrentStep(2);
  }

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

  async function submit(status: "OPEN" | "DRAFT") {
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
    if (form.departmentName.trim()) body.departmentName = form.departmentName.trim();
    if (form.costCenterCode.trim()) body.costCenterCode = form.costCenterCode.trim();
    const nd = toIsoDate(form.neededByDate);
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
  }

  const stepLabels = ["Category & basics", "Financial details", "Review"];
  const isLoading = submitting || savingDraft;

  const inner = (
    <div className="space-y-6">
      {globalError && (
        <div className="rounded-lg border border-(--color-danger-soft) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)">
          {globalError}
        </div>
      )}

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs font-medium text-(--text-muted)">
          Step {currentStep} of 3 — {stepLabels[currentStep - 1]}
        </p>
        <div className="flex gap-1.5">
          {([1, 2, 3] as const).map((s) => (
            <div
              key={s}
              className={[
                "h-2 flex-1 rounded-full sm:w-16 sm:flex-none",
                s <= currentStep ? "bg-(--color-primary)" : "bg-(--border-subtle)",
              ].join(" ")}
            />
          ))}
        </div>
      </div>

      {currentStep === 1 && (
        <div className="space-y-6">
          <div>
            <p className="mb-2 text-sm font-medium text-(--text-primary)">
              Request category <span className="text-(--color-danger)">*</span>
            </p>
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
              {FINANCE_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  disabled={isLoading}
                  onClick={() => selectCategoryAndScrollToTitle(setField, titleFieldRef, cat)}
                  className={[
                    "flex gap-3 rounded-xl border p-3 text-left transition-colors",
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
            <p className="mt-4 text-xs font-medium text-(--text-muted)">Other (legacy)</p>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
              {LEGACY_CATEGORIES.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  disabled={isLoading}
                  onClick={() => selectCategoryAndScrollToTitle(setField, titleFieldRef, cat)}
                  className={[
                    "flex gap-2 rounded-lg border p-2 text-left transition-colors",
                    form.category === cat
                      ? "border-(--color-primary) bg-(--color-primary-soft)"
                      : "border-(--border-subtle) bg-(--bg-surface-elev) hover:bg-(--bg-surface-hover)",
                  ].join(" ")}
                >
                  <CategoryIcon type={cat} size={16} />
                  <span className="min-w-0">
                    <span className="block text-[11px] font-medium text-(--text-secondary)">
                      {RECORD_TYPE_LABELS[cat]}
                    </span>
                    <span className="mt-0.5 block text-[10px] text-(--text-muted)">
                      {CATEGORY_DESCRIPTIONS[cat]} <span className="opacity-80">(legacy)</span>
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
                    "rounded-lg border px-3 py-1.5 text-xs font-medium transition-colors",
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
                <Input
                  value={form.currency}
                  onChange={(e) => setField("currency", e.target.value.toUpperCase())}
                  placeholder="USD"
                  maxLength={3}
                  disabled={isLoading}
                  className={errors.currency ? "border-(--color-danger)" : ""}
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

          {config.visibleFields.includes("departmentName") && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">Department</label>
              <Input
                value={form.departmentName}
                onChange={(e) => setField("departmentName", e.target.value)}
                maxLength={120}
                disabled={isLoading}
              />
            </div>
          )}

          {config.visibleFields.includes("costCenterCode") && (
            <div className="space-y-1.5">
              <label className="block text-sm font-medium text-(--text-primary)">Cost center</label>
              <Input
                value={form.costCenterCode}
                onChange={(e) => setField("costCenterCode", e.target.value)}
                maxLength={60}
                disabled={isLoading}
              />
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
                  className="h-4 w-4 rounded border-(--border-subtle)"
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
                className="h-4 w-4 rounded border-(--border-subtle)"
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

      <div className="flex flex-col-reverse gap-2 border-t border-(--border-subtle) pt-4 sm:flex-row sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {currentStep > 1 && (
            <button
              type="button"
              onClick={goBack}
              disabled={isLoading}
              className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
            >
              Back
            </button>
          )}
          {variant === "page" && currentStep === 1 && (
            <button
              type="button"
              onClick={() => window.history.back()}
              disabled={isLoading}
              className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
            >
              Cancel
            </button>
          )}
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {currentStep < 3 ? (
            <button
              type="button"
              onClick={goNext}
              disabled={isLoading}
              className="inline-flex h-9 items-center rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              Next
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={() => void submit("DRAFT")}
                disabled={isLoading || !form.title.trim()}
                className="inline-flex h-9 items-center gap-2 rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
              >
                {savingDraft && <Spinner size="sm" />}
                {savingDraft ? "Saving…" : "Save as draft"}
              </button>
              <button
                type="button"
                onClick={() => void submit("OPEN")}
                disabled={isLoading || !canSubmitOpen}
                className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
              >
                {submitting && <Spinner size="sm" />}
                {submitting ? "Creating…" : "Create financial request"}
              </button>
            </>
          )}
        </div>
      </div>
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
