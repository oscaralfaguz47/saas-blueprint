"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { IconCheck } from "@/components/ui/icons";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";

export type EligibleMember = {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
};

type Props = {
  open: boolean;
  onClose: () => void;
  workspaceName: string;
  workspaceSlug: string;
  currentPrimaryOwnerName: string;
  eligibleMembers: EligibleMember[];
  onSuccess?: () => void;
};

type Step = "select" | "confirm";

export function TransferOwnershipModal({
  open,
  onClose,
  workspaceName,
  workspaceSlug,
  currentPrimaryOwnerName,
  eligibleMembers,
  onSuccess,
}: Props) {
  const router = useRouter();
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [step, setStep] = useState<Step>("select");
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [slugConfirm, setSlugConfirm] = useState("");
  const [search, setSearch] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedMember = useMemo(
    () => eligibleMembers.find((m) => m.userId === selectedUserId) ?? null,
    [eligibleMembers, selectedUserId],
  );

  const filteredMembers = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return eligibleMembers;
    return eligibleMembers.filter((m) => {
      const name = (m.name ?? "").toLowerCase();
      const email = (m.email ?? "").toLowerCase();
      return name.includes(term) || email.includes(term);
    });
  }, [eligibleMembers, search]);

  const canConfirm = step === "confirm" && slugConfirm.trim() === workspaceSlug;

  const handleContinue = () => {
    if (!selectedUserId) return;
    setError(null);
    setStep("confirm");
  };

  const handleBack = () => {
    setStep("select");
    setSlugConfirm("");
    setError(null);
  };

  const handleTransfer = async () => {
    if (!selectedUserId || !canConfirm) return;
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/tenant/primary-owner/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          newPrimaryOwnerUserId: selectedUserId,
          workspaceSlugConfirm: slugConfirm.trim(),
        }),
        showToastOnError: false,
      });
      const data = (await res.json()) as {
        data?: { ok?: boolean };
        error?: string;
        message?: string;
        details?: { code?: string };
      };
      if (!res.ok) {
        const code = data.details?.code;
        const msg =
          code === "NEED_STEP_UP"
            ? "Please sign in again to perform this action."
            : code === "RATE_LIMITED"
              ? "Too many transfer attempts. Try again later."
              : code === "TARGET_NOT_ACTIVE"
                ? "Target user is no longer active."
                : code === "PRIMARY_OWNER_CHANGED"
                  ? "Primary Owner has changed during this operation."
                  : ((data.message as string) ?? "Transfer could not be completed.");
        setError(msg);
        setSubmitting(false);
        return;
      }
      toast.addToast("success", "Ownership transferred successfully.");
      onSuccess?.();
      router.refresh();
      handleClose();
    } catch {
      setError("Transfer could not be completed.");
    } finally {
      setSubmitting(false);
    }
  };

  const handleClose = () => {
    if (!submitting) {
      setStep("select");
      setSelectedUserId(null);
      setSlugConfirm("");
      setSearch("");
      setError(null);
      onClose();
    }
  };

  if (!open) return null;

  const title = step === "select" ? "Transfer Primary Ownership" : "Confirm transfer";

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description={
        step === "select"
          ? "Choose a member to become the new Primary Owner. They must be an Owner or Admin."
          : "Type your workspace slug to confirm this action."
      }
      closeDisabled={submitting}
    >
      {step === "select" ? (
        <div className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Current Primary Owner:{" "}
            <strong className="text-(--text-primary)">{currentPrimaryOwnerName}</strong>. You are
            about to give up the Primary Owner role. Only Owners or Admins can be selected.
          </p>
          <div>
            <label
              htmlFor="transfer-search"
              className="block text-sm font-medium text-(--text-primary)"
            >
              Search members
            </label>
            <Input
              id="transfer-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by name or email"
              className="mt-1.5"
              maxLength={200}
            />
          </div>
          <div className="max-h-[240px] overflow-x-hidden overflow-y-auto rounded-lg border border-(--border-subtle)">
            {filteredMembers.length === 0 ? (
              <p className="p-4 text-sm text-(--text-muted)">
                {eligibleMembers.length === 0
                  ? "No eligible members (Owner or Admin) in this workspace."
                  : "No members match your search."}
              </p>
            ) : (
              <ul className="divide-y divide-(--border-subtle)">
                {filteredMembers.map((m) => {
                  const isSelected = selectedUserId === m.userId;
                  return (
                    <li key={m.userId} className="min-w-0">
                      <button
                        type="button"
                        onClick={() => setSelectedUserId(m.userId)}
                        className={`flex w-full min-w-0 items-center gap-3 px-4 py-3 text-left text-sm transition-colors ${
                          isSelected
                            ? "border-l-4 border-l-(--color-primary) bg-(--color-primary)/15 text-(--text-primary) ring-1 ring-(--color-primary)/30"
                            : "border-l-4 border-l-transparent text-(--text-primary) hover:bg-(--bg-surface-elev)"
                        }`}
                        aria-pressed={isSelected}
                        aria-label={`Select ${m.name ?? m.email ?? "member"} as new Primary Owner`}
                      >
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-(--bg-surface-elev)">
                          {isSelected ? (
                            <IconCheck size={14} className="text-(--color-primary)" aria-hidden />
                          ) : (
                            <span
                              className="h-2.5 w-2.5 rounded-full border border-(--border-subtle)"
                              aria-hidden
                            />
                          )}
                        </span>
                        <span className="min-w-0 flex-1 overflow-hidden">
                          <span className="block truncate font-medium text-(--text-primary)">
                            {m.name ?? m.email ?? "—"}
                          </span>
                          {m.email && m.name ? (
                            <span className="block truncate text-(--text-muted)">{m.email}</span>
                          ) : null}
                        </span>
                        <span className="shrink-0 rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs text-(--text-secondary)">
                          {m.role}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)"
            >
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="cursor-pointer rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleContinue}
              disabled={!selectedUserId}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Continue
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-4 text-sm">
            <p className="text-(--text-secondary)">
              Previous Primary Owner:{" "}
              <strong className="text-(--text-primary)">{currentPrimaryOwnerName}</strong>
            </p>
            <p className="mt-2 text-(--text-secondary)">
              New Primary Owner:{" "}
              <strong className="text-(--text-primary)">
                {selectedMember?.name ?? selectedMember?.email ?? "—"}
              </strong>
            </p>
            <p className="mt-4 text-(--text-primary)">
              You are about to transfer the Primary Owner role to{" "}
              {selectedMember?.name ?? selectedMember?.email ?? "this member"}. This action is
              irreversible and will remove you from the Primary Owner role. Are you sure you want to
              continue?
            </p>
          </div>
          <div>
            <label
              htmlFor="transfer-slug-confirm"
              className="block text-sm font-medium text-(--text-primary)"
            >
              Type the workspace slug to confirm: <strong>{workspaceSlug}</strong>
            </label>
            <Input
              id="transfer-slug-confirm"
              type="text"
              value={slugConfirm}
              onChange={(e) => setSlugConfirm(e.target.value)}
              placeholder={workspaceSlug}
              disabled={submitting}
              className="mt-1.5 font-mono"
              autoComplete="off"
            />
          </div>
          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)"
            >
              {error}
            </div>
          ) : null}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleBack}
              disabled={submitting}
              className="cursor-pointer rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Back
            </button>
            <button
              type="button"
              onClick={handleTransfer}
              disabled={!canConfirm || submitting}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-(--color-danger) px-4 text-sm font-medium text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" /> Transferring…
                </span>
              ) : (
                "Transfer Ownership"
              )}
            </button>
          </div>
        </div>
      )}
    </Dialog>
  );
}
