"use client";

import { useCallback, useEffect, useState } from "react";
import { FinanceResponsibility } from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useToast } from "@/components/ui/toast";
import { getApiErrorMessage } from "@/lib/api-client";
import type { ApiFetchOptions } from "@/hooks/use-api-fetch";

type ApiFetch = (url: RequestInfo | URL, init?: ApiFetchOptions) => Promise<Response>;

type Props = {
  open: boolean;
  onClose: () => void;
  recordId: string;
  recordTitle: string;
  apiFetch: ApiFetch;
  onSuccess: () => Promise<void>;
};

type MemberRow = {
  membershipId: string;
  name: string | null;
  email: string;
  financeResponsibility: FinanceResponsibility;
};

const ALLOWED = new Set<FinanceResponsibility>([
  FinanceResponsibility.PROCESS,
  FinanceResponsibility.PROCESS_AND_APPROVE,
]);

export function ReassignModal({ open, onClose, recordId, recordTitle, apiFetch, onSuccess }: Props) {
  const toast = useToast();
  const [mode, setMode] = useState<"DIRECT" | "EVALUATION">("DIRECT");
  const [targetMembershipId, setTargetMembershipId] = useState("");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [directoryError, setDirectoryError] = useState<string | null>(null);
  const [members, setMembers] = useState<MemberRow[]>([]);
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [search, setSearch] = useState("");

  const loadMembers = useCallback(
    async (term: string) => {
      setLoadingMembers(true);
      setDirectoryError(null);
      try {
        const q = new URLSearchParams({
          statuses: "ACTIVE",
          limit: "20",
        });
        if (term.trim()) q.set("search", term.trim());
        const res = await apiFetch(`/api/settings/workspace/members?${q}`, {
          showToastOnError: false,
        });
        const data = (await res.json().catch(() => ({}))) as {
          data?: { items?: MemberRow[] };
          error?: { message?: string };
        };
        if (res.status === 403) {
          setDirectoryError(
            "You need member directory access to pick an assignee. You can still run evaluation below."
          );
          setMembers([]);
          return;
        }
        if (!res.ok) {
          setDirectoryError(getApiErrorMessage(res, data));
          setMembers([]);
          return;
        }
        const items = (data.data?.items ?? []).map((m) => ({
          membershipId: m.membershipId,
          name: m.name,
          email: m.email,
          financeResponsibility: m.financeResponsibility,
        }));
        setMembers(items);
      } catch {
        setDirectoryError("Could not load members.");
        setMembers([]);
      } finally {
        setLoadingMembers(false);
      }
    },
    [apiFetch]
  );

  useEffect(() => {
    if (!open) {
      setMode("DIRECT");
      setTargetMembershipId("");
      setNote("");
      setDirectoryError(null);
      setMembers([]);
      setSearch("");
      return;
    }
  }, [open]);

  useEffect(() => {
    if (!open || mode !== "DIRECT") return;
    const t = window.setTimeout(() => {
      void loadMembers(search);
    }, 300);
    return () => window.clearTimeout(t);
  }, [open, mode, search, loadMembers]);

  const processorOptions = members
    .filter((m) => ALLOWED.has(m.financeResponsibility))
    .map((m) => ({
      value: m.membershipId,
      label: [m.name, m.email].filter(Boolean).join(" · ") || m.email,
    }));

  async function submit() {
    setSubmitting(true);
    try {
      const body: { targetMembershipId?: string; note?: string } = {};
      if (note.trim()) body.note = note.trim();
      if (mode === "DIRECT") {
        if (!targetMembershipId) {
          toast.addToast("error", "Select a team member to assign.");
          setSubmitting(false);
          return;
        }
        body.targetMembershipId = targetMembershipId;
      }
      const res = await apiFetch(`/api/finance/assignments/${recordId}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { code?: string; message?: string };
      };
      if (!res.ok) {
        toast.addToast("error", getApiErrorMessage(res, data));
        return;
      }
      toast.addToast("success", "Reassignment submitted.");
      onClose();
      await onSuccess();
    } catch {
      toast.addToast("error", "Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      closeDisabled={submitting}
      title="Reassign finance work"
      description={`Record: ${recordTitle}`}
      contentClassName="max-w-md"
      footer={
        <div className="flex justify-end gap-2">
          <button
            type="button"
            disabled={submitting}
            onClick={onClose}
            className="rounded-lg border border-(--border-subtle) px-3 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-hover) disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void submit()}
            className="rounded-lg bg-(--color-primary) px-3 py-2 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
          >
            {submitting ? "Saving…" : "Submit"}
          </button>
        </div>
      }
    >
      <div className="space-y-4 text-sm">
        <fieldset className="space-y-2">
          <legend className="text-xs font-medium text-(--text-muted)">Mode</legend>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="reassign-mode"
              checked={mode === "DIRECT"}
              onChange={() => {
                setMode("DIRECT");
                setDirectoryError(null);
              }}
              disabled={submitting}
            />
            <span>Assign to a specific member</span>
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input
              type="radio"
              name="reassign-mode"
              checked={mode === "EVALUATION"}
              onChange={() => {
                setMode("EVALUATION");
                setTargetMembershipId("");
              }}
              disabled={submitting}
            />
            <span>Run assignment rules (evaluation)</span>
          </label>
        </fieldset>

        {mode === "DIRECT" ? (
          <div>
            <label htmlFor="reassign-member" className="text-xs font-medium text-(--text-muted)">
              Member (finance processors only)
            </label>
            {directoryError ? (
              <p className="mt-1 text-xs text-warning">{directoryError}</p>
            ) : null}
            {loadingMembers ? (
              <p className="mt-2 text-xs text-(--text-muted)">Loading directory…</p>
            ) : (
              <SearchableSelect
                id="reassign-member"
                aria-label="Assign to member"
                options={processorOptions}
                value={targetMembershipId}
                onChange={setTargetMembershipId}
                placeholder="Search by name or email…"
                disabled={submitting || !!directoryError}
              />
            )}
            <label htmlFor="reassign-search-api" className="mt-3 block text-xs text-(--text-muted)">
              Refine directory search
            </label>
            <input
              id="reassign-search-api"
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Type to search workspace members…"
              className="mt-1 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
              disabled={submitting}
            />
          </div>
        ) : null}

        <div>
          <label htmlFor="reassign-note" className="text-xs font-medium text-(--text-muted)">
            Note (optional)
          </label>
          <textarea
            id="reassign-note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            className="mt-1 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
            disabled={submitting}
            placeholder="Context for the audit log…"
          />
        </div>
      </div>
    </Dialog>
  );
}
