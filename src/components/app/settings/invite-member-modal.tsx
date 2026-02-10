"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  onSuccess?: () => void;
};

type SubmitMode = "email" | "link";

export function InviteMemberModal({ open, onClose, workspaceName, onSuccess }: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "linkReady">("idle");
  const [submittingMode, setSubmittingMode] = useState<SubmitMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const submit = async (mode: SubmitMode) => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setError(null);
    setInviteUrl(null);
    setSubmittingMode(mode);
    setStatus("submitting");
    try {
      const res = await apiFetch("/api/tenant/invitations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmed, sendEmail: mode === "email" }),
      });
      const data = (await res.json()) as {
        data?: { invitation?: unknown; inviteUrl?: string };
        error?: string;
        message?: string;
        details?: { code?: string };
      };
      if (!res.ok) {
        const msg =
          data.error === "CONFLICT" || data.details?.code === "ACTIVE_INVITE_EXISTS"
            ? "An active invite already exists for this email."
            : (data.message as string) ?? "Failed to send invite.";
        setError(msg);
        setStatus("error");
        setSubmittingMode(null);
        return;
      }
      const inviteUrlFromApi = data.data?.inviteUrl;
      setSubmittingMode(null);
      if (mode === "email") {
        setEmail("");
        setStatus("idle");
        onSuccess?.();
        router.refresh();
        onClose();
        return;
      }
      if (inviteUrlFromApi) {
        setInviteUrl(inviteUrlFromApi);
        setStatus("linkReady");
      } else {
        setStatus("idle");
      }
    } catch {
      setError("Something went wrong. Please try again.");
      setStatus("error");
      setSubmittingMode(null);
    }
  };

  const handleSubmitEmail = (e: React.FormEvent) => {
    e.preventDefault();
    submit("email");
  };

  const handleGetLink = (e: React.FormEvent) => {
    e.preventDefault();
    submit("link");
  };

  const handleCopy = async () => {
    if (!inviteUrl) return;
    try {
      await navigator.clipboard.writeText(inviteUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy to clipboard.");
    }
  };

  const handleClose = () => {
    if (status !== "submitting") {
      setEmail("");
      setError(null);
      setStatus("idle");
      setInviteUrl(null);
      setCopied(false);
      setSubmittingMode(null);
      onClose();
    }
  };

  const showForm = status !== "linkReady";

  return (
    <Dialog open={open} onClose={handleClose} title={`Invite to ${workspaceName}`} closeDisabled={status === "submitting"}>
      {showForm ? (
        <form onSubmit={handleSubmitEmail} className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Enter their email to send an invite, or generate a link to share (Slack, etc.).
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
          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={status === "submitting"}
              className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGetLink}
              disabled={status === "submitting" || !email.trim()}
              className="inline-flex h-10 items-center justify-center rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
            >
              {status === "submitting" && submittingMode === "link" ? <><Spinner size="sm" className="mr-2" /> Creating…</> : "Get invite link"}
            </button>
            <button
              type="submit"
              disabled={status === "submitting" || !email.trim()}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
            >
              {status === "submitting" && submittingMode === "email" ? <><Spinner size="sm" className="mr-2" /> Sending…</> : "Send invite"}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Share this link with <span className="font-medium text-(--text-primary)">{email}</span>. It will expire in 7 days.
          </p>
          <div className="flex gap-2">
            <input
              type="text"
              readOnly
              value={inviteUrl ?? ""}
              className="flex-1 rounded-lg border border-(--border-subtle) bg-(--bg-main) px-3 py-2.5 text-sm text-(--text-primary) focus:outline-none"
              aria-label="Invite URL"
            />
            <button
              type="button"
              onClick={handleCopy}
              className="shrink-0 rounded-lg bg-(--color-primary) px-4 py-2.5 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => { setStatus("idle"); setInviteUrl(null); setEmail(""); onSuccess?.(); router.refresh(); }}
              className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
            >
              Invite another
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
