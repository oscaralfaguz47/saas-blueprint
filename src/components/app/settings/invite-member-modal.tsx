"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";

const ROLE_RANK: Record<string, number> = {
  "Primary Owner": 5,
  Owner: 4,
  Admin: 3,
  Finance: 2,
  Member: 1,
};

const ALL_ASSIGNABLE_ROLES = [
  {
    value: "Owner",
    label: "Owner",
    description: "Full workspace control",
    dot: "#7c3aed", // purple
  },
  {
    value: "Admin",
    label: "Admin",
    description: "Broad management, no billing ownership",
    dot: "#2563eb", // blue
  },
  {
    value: "Finance",
    label: "Finance",
    description: "Requests, approvals, payments",
    dot: "#16a34a", // green
  },
  {
    value: "Member",
    label: "Member",
    description: "Request creation and participation",
    dot: "#71717a", // gray
  },
];

function getAssignableRoles(currentUserRole: string) {
  const rank = ROLE_RANK[currentUserRole] ?? 1;
  return ALL_ASSIGNABLE_ROLES.filter((r) => (ROLE_RANK[r.value] ?? 0) < rank);
}

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  currentUserRole: string;
  onSuccess?: () => void;
};

type SubmitMode = "email" | "link";

export function InviteMemberModal({
  open,
  onClose,
  workspaceName,
  currentUserRole,
  onSuccess,
}: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("Member");
  const [status, setStatus] = useState<"idle" | "submitting" | "error" | "linkReady">("idle");
  const [submittingMode, setSubmittingMode] = useState<SubmitMode | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [inviteUrl, setInviteUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const assignableRoles = getAssignableRoles(currentUserRole);

  // Ensure selected role is always valid for this user
  const effectiveRole = assignableRoles.some((r) => r.value === role)
    ? role
    : (assignableRoles[assignableRoles.length - 1]?.value ?? "Member");

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
        body: JSON.stringify({
          email: trimmed,
          sendEmail: mode === "email",
          role: effectiveRole,
        }),
        showToastOnError: false,
      });
      const data = (await res.json()) as {
        data?: { invitation?: unknown; inviteUrl?: string };
        error?: { code?: string; message?: string; details?: { code?: string } };
      };
      if (!res.ok) {
        const msg =
          data.error?.code === "VALIDATION_ERROR" &&
          typeof data.error?.message === "string" &&
          data.error.message.toLowerCase().includes("already a member")
            ? "User is already a member of this workspace."
            : data.error?.code === "CONFLICT" ||
                data.error?.details?.code === "ACTIVE_INVITE_EXISTS"
              ? "An active invite already exists for this email."
              : ((data.error?.message as string) ?? "Failed to send invite.");
        setError(msg);
        setStatus("error");
        setSubmittingMode(null);
        return;
      }
      const inviteUrlFromApi = data.data?.inviteUrl;
      setSubmittingMode(null);
      if (mode === "email") {
        setEmail("");
        setRole("Member");
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
      setRole("Member");
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
    <Dialog
      open={open}
      onClose={handleClose}
      title={`Invite to ${workspaceName}`}
      closeDisabled={status === "submitting"}
    >
      {showForm ? (
        <form onSubmit={handleSubmitEmail} className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Enter their email to send an invite, or generate a link to share (Slack, etc.).
          </p>

          {/* Email field */}
          <div>
            <label
              htmlFor="invite-email"
              className="block text-sm font-medium text-(--text-primary)"
            >
              Email
            </label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@example.com"
              disabled={status === "submitting"}
              required
              className="mt-1.5"
            />
          </div>

          {/* Role selector */}
          {assignableRoles.length > 0 ? (
            <div>
              <label className="block text-sm font-medium text-(--text-primary)">Role</label>
              <div className="mt-1.5 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {assignableRoles.map((r) => (
                  <button
                    key={r.value}
                    type="button"
                    disabled={status === "submitting"}
                    onClick={() => setRole(r.value)}
                    className={`cursor-pointer flex flex-col items-start rounded-lg border px-3 py-2.5 text-left transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                      effectiveRole === r.value
                        ? "border-(--color-primary) bg-(--color-primary)/5 ring-1 ring-(--color-primary)"
                        : "border-(--border-subtle) bg-(--bg-surface) hover:border-(--border-default) hover:bg-(--bg-surface-elev)"
                    }`}
                  >
                    <span className="flex w-full items-center gap-2">
                      <span
                        style={{ backgroundColor: r.dot }}
                        className="mt-0.5 h-2 w-2 shrink-0 rounded-full"
                      />
                      <span
                        className={`text-sm font-medium ${effectiveRole === r.value ? "text-(--color-primary)" : "text-(--text-primary)"}`}
                      >
                        {r.label}
                      </span>
                    </span>
                    <span className="mt-0.5 pl-4 text-xs text-(--text-muted)">{r.description}</span>
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5">
              <p className="text-xs text-(--text-muted)">
                You can only invite members. Role changes can be made after they join.
              </p>
            </div>
          )}

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)"
            >
              {error}
            </div>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={status === "submitting"}
              className="cursor-pointer rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleGetLink}
              disabled={status === "submitting" || !email.trim()}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" && submittingMode === "link" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" /> Creating…
                </span>
              ) : (
                "Get invite link"
              )}
            </button>
            <button
              type="submit"
              disabled={status === "submitting" || !email.trim()}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {status === "submitting" && submittingMode === "email" ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" /> Sending…
                </span>
              ) : (
                "Send invite"
              )}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Share this link with{" "}
            <span className="font-medium text-(--text-primary)">{email}</span>. It expires in 7
            days. They will join as{" "}
            <span className="font-medium text-(--text-primary)">{effectiveRole}</span>.
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
              className="shrink-0 cursor-pointer rounded-lg bg-(--color-primary) px-4 py-2.5 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              {copied ? "Copied!" : "Copy"}
            </button>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setStatus("idle");
                setInviteUrl(null);
                setEmail("");
                setRole("Member");
                onSuccess?.();
                router.refresh();
              }}
              className="cursor-pointer rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev)"
            >
              Invite another
            </button>
            <button
              type="button"
              onClick={handleClose}
              className="cursor-pointer rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
