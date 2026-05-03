"use client";

/* TD-D6-001: react-hook-form deferred — keep native form + local state to match set-payment-status-modal. */

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { PlanGateBanner } from "@/components/ui/plan-gate";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";

type Props = {
  open: boolean;
  onClose: () => void;
  recordId: string;
  onSuccess: () => void;
};

export function ManualRerouteModal({ open, onClose, recordId, onSuccess }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [planBlocked, setPlanBlocked] = useState(false);

  useEffect(() => {
    if (open) {
      setNote("");
      setError(null);
      setPlanBlocked(false);
    }
  }, [open]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setPlanBlocked(false);
    const trimmed = note.trim();
    const body = trimmed ? { note: trimmed } : {};
    try {
      const res = await apiFetch(`/api/records/${recordId}/routing/evaluate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        success?: boolean;
        data?: { warning?: string };
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        if (res.status === 403 && isUpgradeRequiredFromApiResponse(json)) {
          setPlanBlocked(true);
          setError(json.error?.message ?? "Approval routing is not available on your plan.");
          return;
        }
        if (res.status === 403) {
          setError(json.error?.message ?? "You do not have permission to re-evaluate routing.");
          return;
        }
        if (res.status === 400) {
          setError(json.error?.message ?? "Invalid request.");
          return;
        }
        if (res.status === 404) {
          setError(json.error?.message ?? "Record not found.");
          return;
        }
        if (res.status === 409) {
          setError(json.error?.message ?? "Cannot re-evaluate routing for this record.");
          return;
        }
        setError(json.error?.message ?? "Could not re-evaluate routing.");
        return;
      }
      if (json.success !== true) {
        setError("Unexpected response.");
        return;
      }
      const warn = json.data?.warning;
      toast.addToast(
        "success",
        warn ? `Approval routing re-evaluated. ${warn}` : "Approval routing re-evaluated.",
      );
      onClose();
      onSuccess();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      title="Re-evaluate approval routing"
      closeDisabled={submitting}
      contentClassName="max-w-md"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <PlanGateBanner
          variant="modal"
          visible={planBlocked}
          description="Upgrade to use approval routing."
        />
        {error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)">
            {error}
          </p>
        )}
        <p className="text-sm text-(--text-secondary)">
          Clears routing-assigned pending approvers and runs the engine again. Optional note is stored
          on the audit trail (max 500 characters).
        </p>
        <div>
          <label htmlFor="manual-reroute-note" className="mb-1 block text-xs font-medium text-(--text-secondary)">
            Note (optional)
          </label>
          <textarea
            id="manual-reroute-note"
            value={note}
            onChange={(ev) => setNote(ev.target.value)}
            maxLength={500}
            rows={3}
            disabled={submitting}
            className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:border-(--color-primary) focus:outline-none focus:ring-1 focus:ring-(--color-primary) disabled:opacity-60"
            placeholder="Reason for manual re-evaluation…"
          />
          <p className="mt-1 text-xs text-(--text-muted)">{note.length}/500</p>
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
            disabled={submitting}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Re-evaluating…" : "Re-evaluate"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
