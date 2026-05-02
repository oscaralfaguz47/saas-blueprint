"use client";

import { useCallback, useEffect, useState } from "react";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { FINANCE_RESPONSIBILITY_LABELS } from "@/lib/4-axis-labels";
import type { FinanceResponsibility } from "@prisma/client";

const MAX_MEMBER_PAGES = 15;
const MEMBERS_PAGE_LIMIT = 20;

const ALLOWED_FINANCE_RESPONSIBILITY = new Set<FinanceResponsibility>([
  "PROCESS",
  "PROCESS_AND_APPROVE",
]);

type WorkspaceMemberRow = {
  membershipId?: string;
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  financeResponsibility?: string;
};

export function filterEligibleForFinanceTeam(
  members: WorkspaceMemberRow[],
  existingMembershipIds: Set<string>,
): WorkspaceMemberRow[] {
  return members.filter((m) => {
    const mid = m.membershipId;
    if (!mid || existingMembershipIds.has(mid)) return false;
    if (m.status !== "ACTIVE") return false;
    const fr = m.financeResponsibility;
    if (!fr || !ALLOWED_FINANCE_RESPONSIBILITY.has(fr as FinanceResponsibility)) return false;
    return true;
  });
}

function toSelectOptions(eligible: WorkspaceMemberRow[]) {
  return eligible.map((m) => {
    const fr = m.financeResponsibility as FinanceResponsibility | undefined;
    const frLabel = fr ? FINANCE_RESPONSIBILITY_LABELS[fr] ?? fr : "";
    const primary = m.name ?? m.email ?? "Member";
    const secondary = m.email && m.name !== m.email ? m.email : "";
    const label = [primary, secondary, m.role, frLabel].filter(Boolean).join(" · ");
    return { value: m.membershipId!, label };
  });
}

type Props = {
  open: boolean;
  onClose: () => void;
  teamId: string;
  existingMembershipIds: Set<string>;
  onSuccess: () => void;
};

export function FinanceTeamMemberAddModal({
  open,
  onClose,
  teamId,
  existingMembershipIds,
  onSuccess,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [loadingMembers, setLoadingMembers] = useState(false);
  const [options, setOptions] = useState<{ value: string; label: string }[]>([]);
  const [membershipId, setMembershipId] = useState("");
  const [weight, setWeight] = useState("100");
  const [isLead, setIsLead] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadMembers = useCallback(async () => {
    setLoadingMembers(true);
    setError(null);
    try {
      const aggregated: WorkspaceMemberRow[] = [];
      let cursor: string | null | undefined = undefined;
      for (let page = 0; page < MAX_MEMBER_PAGES; page++) {
        const params = new URLSearchParams();
        params.set("limit", String(MEMBERS_PAGE_LIMIT));
        params.set("statuses", "ACTIVE");
        params.set("sortBy", "joined");
        params.set("sortDir", "desc");
        if (cursor) params.set("cursor", cursor);
        const res = await apiFetch(`/api/settings/workspace/members?${params.toString()}`, {
          showToastOnError: false,
        });
        const data = (await res.json().catch(() => ({}))) as {
          data?: { items?: WorkspaceMemberRow[]; nextCursor?: string | null };
        };
        if (!res.ok) {
          setError("Could not load members.");
          setOptions([]);
          return;
        }
        const items = data.data?.items ?? [];
        aggregated.push(...items);
        cursor = data.data?.nextCursor ?? null;
        if (!cursor) break;
      }
      const eligible = filterEligibleForFinanceTeam(aggregated, existingMembershipIds);
      setOptions(toSelectOptions(eligible));
    } catch {
      setError("Could not load members.");
      setOptions([]);
    } finally {
      setLoadingMembers(false);
    }
  }, [apiFetch, existingMembershipIds]);

  useEffect(() => {
    if (!open) return;
    setMembershipId("");
    setWeight("100");
    setIsLead(false);
    setError(null);
    void loadMembers();
  }, [open, teamId, loadMembers]);

  const handleClose = () => {
    if (!submitting && !loadingMembers) {
      setError(null);
      onClose();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const mid = membershipId.trim();
    if (!mid) {
      setError("Select a member.");
      return;
    }
    const w = weight.trim() === "" ? 100 : Number(weight.trim());
    if (!Number.isFinite(w) || w < 1 || w > 1000) {
      setError("Weight must be between 1 and 1000.");
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tenant/finance-teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          membershipId: mid,
          weight: Math.floor(w),
          isLead,
        }),
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: { message?: string; details?: { code?: string } };
      };
      if (!res.ok) {
        const detail = data.error?.details?.code;
        if (res.status === 409 || detail === "ALREADY_MEMBER") {
          setError("This user is already on the team.");
          return;
        }
        if (detail === "MEMBERSHIP_LACKS_FINANCE_RESPONSIBILITY") {
          setError(
            data.error?.message ??
              "This member does not have finance processing responsibility.",
          );
          return;
        }
        setError(data.error?.message ?? "Could not add member.");
        return;
      }
      toast.addToast("success", "Member added to team.");
      onSuccess();
      onClose();
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title="Add team member"
      description="Only members with process or process+approve finance responsibility can join."
      closeDisabled={submitting}
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {loadingMembers ? (
          <div className="flex items-center gap-2 text-sm text-(--text-muted)">
            <Spinner size="sm" /> Loading members…
          </div>
        ) : (
          <div>
            <span className="block text-sm font-medium text-(--text-primary)">Member</span>
            <SearchableSelect
              id="ftm-member"
              options={options}
              value={membershipId}
              onChange={setMembershipId}
              disabled={submitting || options.length === 0}
              placeholder="Search members…"
              aria-label="Member"
            />
            {!loadingMembers && options.length === 0 ? (
              <p className="mt-1 text-xs text-(--text-muted)">
                No eligible active members with finance process responsibility.
              </p>
            ) : null}
          </div>
        )}
        <div>
          <label htmlFor="ftm-weight" className="block text-sm font-medium text-(--text-primary)">
            Weight (1–1000)
          </label>
          <Input
            id="ftm-weight"
            type="number"
            min={1}
            max={1000}
            value={weight}
            onChange={(e) => setWeight(e.target.value)}
            disabled={submitting || loadingMembers}
            className="mt-1.5"
          />
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
          <input
            type="checkbox"
            checked={isLead}
            onChange={(e) => setIsLead(e.target.checked)}
            disabled={submitting || loadingMembers}
            className="h-4 w-4 rounded border-(--border-subtle)"
          />
          Team lead
        </label>
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
            disabled={submitting || loadingMembers}
            className="cursor-pointer rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || loadingMembers || !membershipId}
            className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:opacity-60"
          >
            {submitting ? (
              <span className="inline-flex items-center gap-2">
                <Spinner size="sm" />
                Adding…
              </span>
            ) : (
              "Add"
            )}
          </button>
        </div>
      </form>
    </Dialog>
  );
}
