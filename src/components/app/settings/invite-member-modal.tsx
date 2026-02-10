"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  onSuccess?: () => void;
};

export function InviteMemberModal({ open, onClose, workspaceName, onSuccess }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error">("idle");
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setError(null);
    setStatus("submitting");
    try {
      const res = await fetch("/api/tenant/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed }),
      });
      const data = (await res.json()) as { data?: unknown; error?: string; message?: string; details?: { code?: string } };
      if (!res.ok) {
        const msg =
          data.error === "CONFLICT" || data.details?.code === "ACTIVE_INVITE_EXISTS"
            ? "An active invite already exists for this email."
            : (data.message as string) ?? "Failed to send invite.";
        setError(msg);
        toast.addToast("error", msg);
        setStatus("error");
        return;
      }
      setEmail("");
      setStatus("idle");
      onSuccess?.();
      router.refresh();
      onClose();
    } catch {
      const msg = "Something went wrong. Please try again.";
      setError(msg);
      toast.addToast("error", msg);
      setStatus("error");
    }
  };

  const handleClose = () => {
    if (status !== "submitting") {
      setEmail("");
      setError(null);
      setStatus("idle");
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} title={`Invite to ${workspaceName}`} closeDisabled={status === "submitting"}>
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-(--text-secondary)">
          They&apos;ll receive an email to join this workspace.
        </p>
        <div>
          <label htmlFor="invite-email" className="block text-sm font-medium text-(--text-primary)">
            Email
          </label>
          <input
            id="invite-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="colleague@example.com"
            disabled={status === "submitting"}
            required
            className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) focus:outline-none focus:ring-2 focus:ring-(--color-primary) disabled:opacity-60"
          />
        </div>
        {error ? (
          <div role="alert" className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)">
            {error}
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            disabled={status === "submitting"}
            className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={status === "submitting" || !email.trim()}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {status === "submitting" ? <><Spinner size="sm" className="mr-2" /> Sending…</> : "Send invite"}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
