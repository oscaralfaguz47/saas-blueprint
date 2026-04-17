"use client";

import { useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  recordId: string;
  onSuccess: () => void;
};

export function AssignExternalApproverModal({ open, onClose, recordId, onSuccess }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdToken, setCreatedToken] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setName("");
      setExpiresInHours("72");
      setError(null);
      setCreatedToken(null);
      setSubmitting(false);
    }
  }, [open]);

  function handleClose() {
    setEmail("");
    setName("");
    setExpiresInHours("72");
    setError(null);
    setCreatedToken(null);
    onClose();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const res = await apiFetch(`/api/records/${recordId}/participants/external`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          name: name.trim() || undefined,
          expiresInHours: Number(expiresInHours) || 72,
        }),
        showToastOnError: false,
      });
      const json = (await res.json().catch(() => ({}))) as {
        data?: { approvalToken?: string; approvalLinkBase?: string };
        error?: { message?: string };
      };
      if (!res.ok) {
        setError(json.error?.message ?? "Failed to assign external approver.");
        return;
      }
      const base = json.data?.approvalLinkBase;
      const token = json.data?.approvalToken;
      if (base) {
        setCreatedToken(new URL(base, window.location.origin).href);
      } else if (token) {
        setCreatedToken(
          new URL(`/api/v1/external/approvals/${token}`, window.location.origin).href
        );
      }
      toast.addToast("success", "External approver assigned.");
      onSuccess();
    } catch {
      setError("Network error.");
    } finally {
      setSubmitting(false);
    }
  }

  if (createdToken) {
    return (
      <Dialog open={open} onClose={handleClose} title="External approver assigned">
        <div className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Share this link with the approver. It expires in {expiresInHours} hours.
          </p>
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3">
            <p className="wrap-break-word font-mono text-xs text-(--text-primary)">{createdToken}</p>
          </div>
          <p className="text-xs text-(--color-warning)">
            This link will not be shown again. Copy it now.
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(createdToken)}
              className="inline-flex h-9 items-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="inline-flex h-9 items-center rounded-lg border border-(--border-subtle) px-4 text-sm text-(--text-secondary) transition-colors hover:bg-(--bg-surface-hover)"
            >
              Done
            </button>
          </div>
        </div>
      </Dialog>
    );
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Assign external approver"
      description="The approver will receive a secure link. No account required."
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-xs text-(--color-danger)">
            {error}
          </p>
        )}
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Email <span className="text-(--color-danger)">*</span>
          </label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="approver@company.com"
            disabled={submitting}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Name <span className="font-normal text-(--text-muted)">(optional)</span>
          </label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Jane Smith"
            disabled={submitting}
          />
        </div>
        <div className="space-y-1.5">
          <label className="block text-sm font-medium text-(--text-primary)">
            Link expires in
          </label>
          <div className="flex gap-2">
            {["24", "72", "168"].map((h) => (
              <button
                key={h}
                type="button"
                onClick={() => setExpiresInHours(h)}
                className={[
                  "rounded-lg border px-3 py-1.5 text-sm transition-colors",
                  expiresInHours === h
                    ? "border-(--color-primary) bg-(--color-primary-soft) text-(--color-primary)"
                    : "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-secondary) hover:bg-(--bg-surface-hover)",
                ].join(" ")}
              >
                {h === "24" ? "24h" : h === "72" ? "3 days" : "7 days"}
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end gap-2 pt-2">
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
            disabled={submitting}
            className="inline-flex h-9 items-center gap-2 rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting && <Spinner size="sm" />}
            {submitting ? "Creating link…" : "Create approval link"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
