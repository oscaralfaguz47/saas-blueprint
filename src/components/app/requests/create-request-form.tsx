"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { CardRoot, CardHeader, CardContent, CardFooter } from "@/components/ui/card";

type RecordTypeValue = "SCOPE_CHANGE" | "DECISION" | "BUDGET";

type FormState = {
  title: string;
  type: RecordTypeValue;
  description: string;
  clientName: string;
  clientEmail: string;
  amount: string;
  currency: string;
};

type FieldError = Partial<Record<keyof FormState, string>>;

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

export function CreateRequestForm() {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const toast = useToast();

  const [form, setForm] = useState<FormState>({
    title: "",
    type: "SCOPE_CHANGE",
    description: "",
    clientName: "",
    clientEmail: "",
    amount: "",
    currency: "",
  });
  const [errors, setErrors] = useState<FieldError>({});
  const [submitting, setSubmitting] = useState(false);
  const [globalError, setGlobalError] = useState<string | null>(null);

  function setField<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: undefined }));
  }

  function validate(): FieldError {
    const e: FieldError = {};
    if (!form.title.trim()) e.title = "Title is required.";
    if (form.title.trim().length > 160) e.title = "Title must be 160 characters or less.";
    if (form.amount && Number.isNaN(Number(form.amount))) e.amount = "Amount must be a number.";
    if (form.amount && Number(form.amount) < 0) e.amount = "Amount must be zero or positive.";
    if (form.currency && !/^[A-Z]{3}$/.test(form.currency))
      e.currency = "Currency must be a 3-letter ISO code (e.g. USD).";
    if (form.clientEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.clientEmail))
      e.clientEmail = "Enter a valid email address.";
    return e;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const fieldErrors = validate();
    if (Object.keys(fieldErrors).length > 0) {
      setErrors(fieldErrors);
      return;
    }
    setSubmitting(true);
    setGlobalError(null);

    const body: Record<string, unknown> = {
      title: form.title.trim(),
      type: form.type,
    };
    if (form.description.trim()) body.description = form.description.trim();
    if (form.clientName.trim()) body.clientName = form.clientName.trim();
    if (form.clientEmail.trim()) body.clientEmail = form.clientEmail.trim();
    if (form.amount) body.amount = Number(form.amount);
    if (form.currency.trim()) body.currency = form.currency.trim().toUpperCase();

    try {
      const res = await apiFetch("/api/records", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });

      const payload = (await res.json().catch(() => ({}))) as ApiErrorBody & {
        data?: { id: string };
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
      toast.addToast("success", "Request created successfully.");
      router.push(`/app/requests/${id}`);
    } catch {
      setGlobalError("Network error. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <CardRoot>
        <CardHeader>
          <h1 className="text-base font-semibold text-(--text-primary)">New Request</h1>
          <p className="mt-0.5 text-sm text-(--text-muted)">
            Fill in the details below to create a new request.
          </p>
        </CardHeader>

        <CardContent className="space-y-5">
          {globalError && (
            <div className="rounded-lg border border-(--color-danger-soft) bg-(--color-danger-soft) px-4 py-3 text-sm text-(--color-danger)">
              {globalError}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="title" className="block text-sm font-medium text-(--text-primary)">
              Title <span className="text-(--color-danger)">*</span>
            </label>
            <Input
              id="title"
              value={form.title}
              onChange={(e) => setField("title", e.target.value)}
              placeholder="e.g. Q2 budget approval"
              maxLength={160}
              aria-describedby={errors.title ? "title-error" : undefined}
              className={errors.title ? "border-(--color-danger)" : ""}
            />
            <div className="flex items-center justify-between">
              {errors.title ? (
                <p id="title-error" className="text-xs text-(--color-danger)">{errors.title}</p>
              ) : (
                <span />
              )}
              <p className="text-xs text-(--text-muted)">{form.title.length}/160</p>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="block text-sm font-medium text-(--text-primary)">
              Type <span className="text-(--color-danger)">*</span>
            </label>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {[
                {
                  value: "SCOPE_CHANGE" as RecordTypeValue,
                  label: "Scope Change",
                  desc: "Changes to project scope or requirements",
                },
                {
                  value: "DECISION" as RecordTypeValue,
                  label: "Decision",
                  desc: "Key decisions that need approval",
                },
                {
                  value: "BUDGET" as RecordTypeValue,
                  label: "Budget",
                  desc: "Financial requests requiring sign-off",
                },
              ].map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setField("type", t.value)}
                  className={[
                    "rounded-lg border p-3 text-left transition-colors",
                    form.type === t.value
                      ? "border-(--color-primary) bg-(--color-primary-soft)"
                      : "border-(--border-subtle) bg-(--bg-surface-elev) hover:bg-(--bg-surface-hover)",
                  ].join(" ")}
                >
                  <p className={[
                    "text-sm font-medium",
                    form.type === t.value ? "text-(--color-primary)" : "text-(--text-primary)",
                  ].join(" ")}>
                    {t.label}
                  </p>
                  <p className="mt-0.5 text-xs text-(--text-muted)">{t.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="description" className="block text-sm font-medium text-(--text-primary)">
              Description <span className="font-normal text-(--text-muted)">(optional)</span>
            </label>
            <Textarea
              id="description"
              value={form.description}
              onChange={(e) => setField("description", e.target.value)}
              placeholder="Provide additional context…"
              rows={4}
              maxLength={5000}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="amount" className="block text-sm font-medium text-(--text-primary)">
                Amount <span className="font-normal text-(--text-muted)">(optional)</span>
              </label>
              <Input
                id="amount"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => setField("amount", e.target.value)}
                placeholder="0.00"
                className={errors.amount ? "border-(--color-danger)" : ""}
              />
              {errors.amount && <p className="text-xs text-(--color-danger)">{errors.amount}</p>}
            </div>
            <div className="space-y-1.5">
              <label htmlFor="currency" className="block text-sm font-medium text-(--text-primary)">
                Currency <span className="font-normal text-(--text-muted)">(optional)</span>
              </label>
              <Input
                id="currency"
                value={form.currency}
                onChange={(e) => setField("currency", e.target.value.toUpperCase())}
                placeholder="USD"
                maxLength={3}
                className={errors.currency ? "border-(--color-danger)" : ""}
              />
              {errors.currency && (
                <p className="text-xs text-(--color-danger)">{errors.currency}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="clientName" className="block text-sm font-medium text-(--text-primary)">
                Client name <span className="font-normal text-(--text-muted)">(optional)</span>
              </label>
              <Input
                id="clientName"
                value={form.clientName}
                onChange={(e) => setField("clientName", e.target.value)}
                placeholder="Acme Corp"
                maxLength={120}
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="clientEmail" className="block text-sm font-medium text-(--text-primary)">
                Client email <span className="font-normal text-(--text-muted)">(optional)</span>
              </label>
              <Input
                id="clientEmail"
                type="email"
                value={form.clientEmail}
                onChange={(e) => setField("clientEmail", e.target.value)}
                placeholder="contact@acme.com"
                className={errors.clientEmail ? "border-(--color-danger)" : ""}
              />
              {errors.clientEmail && (
                <p className="text-xs text-(--color-danger)">{errors.clientEmail}</p>
              )}
            </div>
          </div>
        </CardContent>

        <CardFooter className="flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => router.back()}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) hover:text-(--text-primary) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-medium text-white shadow-sm transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Creating…" : "Create request"}
          </button>
        </CardFooter>
      </CardRoot>
    </form>
  );
}
