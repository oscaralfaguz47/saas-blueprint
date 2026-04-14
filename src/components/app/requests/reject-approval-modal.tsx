"use client";

import { useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: (reason: string) => void | Promise<void>;
  submitting: boolean;
};

export function RejectApprovalModal({ open, onClose, onConfirm, submitting }: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    setReason("");
    setError(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!reason.trim()) {
      setError("Rejection reason is required.");
      return;
    }
    setError(null);
    await onConfirm(reason.trim());
    setReason("");
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Reject request"
      description="Provide a reason for rejection. This will be visible in the request timeline."
      closeDisabled={submitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="text-xs text-(--color-danger)">{error}</p>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Reason <span className="text-(--color-danger)">*</span>
          </label>
          <Textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Explain why you are rejecting this request…"
            rows={4}
            maxLength={2000}
            disabled={submitting}
            autoFocus
          />
          <p className="text-right text-xs text-(--text-muted)">{reason.length}/2000</p>
        </div>
        <div className="flex justify-end gap-2 pt-1">
          <button
            type="button"
            onClick={handleClose}
            disabled={submitting}
            className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || !reason.trim()}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-danger) px-4 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Rejecting…" : "Reject request"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
