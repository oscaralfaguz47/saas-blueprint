"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

type PaymentStatus = "NOT_PAID" | "PENDING" | "PAID";

type Props = {
  open: boolean;
  onClose: () => void;
  recordId: string;
  currentStatus: PaymentStatus | null;
  onSuccess: () => void;
};

const STATUS_OPTIONS: { value: PaymentStatus; label: string; description: string }[] = [
  { value: "NOT_PAID", label: "Not paid", description: "Payment has not been made." },
  { value: "PENDING", label: "Pending", description: "Payment is in progress." },
  { value: "PAID", label: "Paid", description: "Payment has been confirmed." },
];

export function SetPaymentStatusModal({
  open,
  onClose,
  recordId,
  currentStatus,
  onSuccess,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [selected, setSelected] = useState<PaymentStatus>(currentStatus ?? "NOT_PAID");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setSelected(currentStatus ?? "NOT_PAID");
      setError(null);
    }
  }, [open, currentStatus]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/payment`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: selected }),
        showToastOnError: false,
      });
      if (!res.ok) {
        const json = (await res.json().catch(() => ({}))) as {
          error?: { message?: string };
        };
        setError(json.error?.message ?? "Failed to update payment status.");
        return;
      }
      toast.addToast("success", "Payment status updated.");
      onClose();
      onSuccess();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={open} onClose={onClose} title="Update payment status">
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)">
            {error}
          </p>
        )}
        <div className="space-y-2">
          {STATUS_OPTIONS.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setSelected(opt.value)}
              className={[
                "flex w-full items-start gap-3 rounded-lg border p-3 text-left transition-colors",
                selected === opt.value
                  ? "border-(--color-primary) bg-(--color-primary-soft)"
                  : "border-(--border-subtle) bg-(--bg-surface-elev) hover:bg-(--bg-surface-hover)",
              ].join(" ")}
            >
              <div
                className={[
                  "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2 transition-colors",
                  selected === opt.value
                    ? "border-(--color-primary) bg-(--color-primary)"
                    : "border-(--border-strong)",
                ].join(" ")}
              />
              <div>
                <p className="text-sm font-medium text-(--text-primary)">{opt.label}</p>
                <p className="text-xs text-(--text-muted)">{opt.description}</p>
              </div>
            </button>
          ))}
        </div>
        <div className="flex justify-end gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={
              submitting || (currentStatus !== null && selected === currentStatus)
            }
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
