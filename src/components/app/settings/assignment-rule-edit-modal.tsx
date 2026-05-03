"use client";

import { useCallback, useEffect, useState } from "react";
import {
  AssignmentRuleStatus,
  AssignmentStrategy,
} from "@prisma/client";
import { PlanGateBanner } from "@/components/ui/plan-gate";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { STRATEGY_LABELS, STATUS_LABELS } from "@/lib/assignment-rule-labels";
import {
  fetchActiveWorkspaceMembers,
  fetchFinanceTeamsDirectory,
  membersToUserAndMembershipOptions,
} from "@/lib/workspace-directory-fetch";

export type AssignmentRuleDetail = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  teamId: string;
  strategy: AssignmentStrategy;
  specificMembershipId: string | null;
  status: AssignmentRuleStatus;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
};

type RuleScalarBaseline = {
  name: string;
  description: string | null;
  priority: number;
  teamId: string;
  strategy: AssignmentStrategy;
  specificMembershipId: string | null;
  status: AssignmentRuleStatus;
};

export function computeAssignmentRulePatch(
  initial: RuleScalarBaseline,
  form: RuleScalarBaseline,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  if (form.name !== initial.name) diff.name = form.name;
  const d0 = initial.description ?? null;
  const d1 = form.description ?? null;
  if (d0 !== d1) {
    diff.description = form.description === "" || form.description == null ? null : form.description;
  }
  if (form.priority !== initial.priority) diff.priority = form.priority;
  if (form.teamId !== initial.teamId) diff.teamId = form.teamId;
  if (form.status !== initial.status) diff.status = form.status;
  if (form.strategy !== initial.strategy) diff.strategy = form.strategy;

  const s0 = initial.specificMembershipId ?? null;
  const s1 = form.specificMembershipId ?? null;
  if (form.strategy === AssignmentStrategy.SPECIFIC_MEMBER && s1 !== s0) {
    diff.specificMembershipId = s1;
  }

  return diff;
}

type Props = {
  open: boolean;
  ruleId: string | null;
  onClose: () => void;
  onSuccess: (updated: AssignmentRuleDetail) => void;
  onPlanBlocked: () => void;
};

export function AssignmentRuleEditModal({
  open,
  ruleId,
  onClose,
  onSuccess,
  onPlanBlocked,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [baseline, setBaseline] = useState<RuleScalarBaseline | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("100");
  const [teamId, setTeamId] = useState("");
  const [strategy, setStrategy] = useState<AssignmentStrategy>(AssignmentStrategy.ROUND_ROBIN);
  const [specificMembershipId, setSpecificMembershipId] = useState("");
  const [status, setStatus] = useState<AssignmentRuleStatus>(AssignmentRuleStatus.ACTIVE);
  const [teamOptions, setTeamOptions] = useState<{ value: string; label: string }[]>([]);
  const [membershipOptions, setMembershipOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBillingLink, setShowBillingLink] = useState(false);

  const loadTeamsAndMembers = useCallback(async () => {
    const teamsAgg = await fetchFinanceTeamsDirectory(apiFetch);
    setTeamOptions(teamsAgg.map((t) => ({ value: t.id, label: t.name })));
    const membersAgg = await fetchActiveWorkspaceMembers(apiFetch);
    setMembershipOptions(membersToUserAndMembershipOptions(membersAgg).membershipOptions);
  }, [apiFetch]);

  useEffect(() => {
    if (!open || !ruleId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setShowBillingLink(false);
      await loadTeamsAndMembers();
      const res = await apiFetch(`/api/tenant/finance-assignment-rules/${ruleId}`, {
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { data?: AssignmentRuleDetail };
      if (cancelled) return;
      if (!res.ok || !data.data) {
        setError("Could not load rule.");
        setBaseline(null);
        setLoading(false);
        return;
      }
      const r = data.data;
      const b: RuleScalarBaseline = {
        name: r.name,
        description: r.description,
        priority: r.priority,
        teamId: r.teamId,
        strategy: r.strategy,
        specificMembershipId: r.specificMembershipId,
        status: r.status,
      };
      setBaseline(b);
      setName(b.name);
      setDescription(b.description ?? "");
      setPriority(String(b.priority));
      setTeamId(b.teamId);
      setStrategy(b.strategy);
      setSpecificMembershipId(b.specificMembershipId ?? "");
      setStatus(b.status);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ruleId, apiFetch, loadTeamsAndMembers]);

  const formBaseline = (): RuleScalarBaseline => ({
    name: name.trim(),
    description: description.trim() === "" ? null : description.trim(),
    priority: Math.floor(Number(priority.trim()) || 0),
    teamId,
    strategy,
    specificMembershipId:
      strategy === AssignmentStrategy.SPECIFIC_MEMBER ? specificMembershipId.trim() || null : null,
    status,
  });

  const diffEmpty =
    baseline != null && Object.keys(computeAssignmentRulePatch(baseline, formBaseline())).length === 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseline || !ruleId) return;
    const n = name.trim();
    if (!n) {
      setError("Name is required.");
      return;
    }
    if (!teamId) {
      setError("Select a finance team.");
      return;
    }
    const pr = Number(priority.trim());
    if (!Number.isFinite(pr) || pr < 1 || pr > 1000) {
      setError("Priority must be between 1 and 1000.");
      return;
    }
    if (strategy === AssignmentStrategy.SPECIFIC_MEMBER && !specificMembershipId.trim()) {
      setError("Select a member for this strategy.");
      return;
    }
    const form = formBaseline();
    const patch = computeAssignmentRulePatch(baseline, form);
    if (Object.keys(patch).length === 0) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tenant/finance-assignment-rules/${ruleId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
        showToastOnError: false,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isUpgradeRequiredFromApiResponse(data)) {
          onPlanBlocked();
          setShowBillingLink(true);
          setError(
            (data as { error?: { message?: string } }).error?.message ??
              "Upgrade your plan to edit assignment rules.",
          );
          return;
        }
        if (res.status === 404) {
          setError("This rule no longer exists.");
          return;
        }
        if (res.status === 409) {
          setError("An assignment rule with this name already exists.");
          return;
        }
        setError(
          (data as { error?: { message?: string } }).error?.message ?? "Could not update rule.",
        );
        return;
      }
      const updated = (data as { data?: AssignmentRuleDetail }).data;
      if (updated) {
        toast.addToast("success", "Assignment rule updated.");
        onSuccess(updated);
        onClose();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  const strategyOpts = (Object.keys(STRATEGY_LABELS) as AssignmentStrategy[]).map((s) => ({
    value: s,
    label: STRATEGY_LABELS[s],
  }));
  const statusOpts = (Object.keys(STATUS_LABELS) as AssignmentRuleStatus[]).map((s) => ({
    value: s,
    label: STATUS_LABELS[s],
  }));
  const teamSelOpts = [{ value: "", label: "Select team…" }, ...teamOptions];
  const memSelOpts = [{ value: "", label: "Select member…" }, ...membershipOptions];

  if (!open || !ruleId) return null;

  const limitationTip =
    "Conditions are fixed after creation. To change them, archive this rule and create a new one.";

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      title={
        <span className="inline-flex items-center gap-2">
          Edit assignment rule
          <abbr title={limitationTip} className="cursor-help text-(--text-muted) no-underline">
            (i)
          </abbr>
        </span>
      }
      closeDisabled={submitting}
      contentClassName="max-w-lg"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <p className="text-sm text-(--text-secondary)">{limitationTip}</p>
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : (
          <>
            <div>
              <label className="text-sm font-medium text-(--text-primary)">Name</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                disabled={submitting}
                className="mt-1.5"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-(--text-primary)">Description</label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                disabled={submitting}
                rows={2}
                className="mt-1.5"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-(--text-primary)">Priority</label>
                <Input
                  type="number"
                  min={1}
                  max={1000}
                  value={priority}
                  onChange={(e) => setPriority(e.target.value)}
                  disabled={submitting}
                  className="mt-1.5"
                />
              </div>
              <div>
                <label className="text-sm font-medium text-(--text-primary)">Status</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as AssignmentRuleStatus)}
                  disabled={submitting}
                  className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
                >
                  {statusOpts.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-(--text-primary)">Finance team</label>
              <div className="mt-1.5">
                <SearchableSelect
                  options={teamSelOpts}
                  value={teamId}
                  onChange={setTeamId}
                  disabled={submitting}
                  placeholder="Search teams…"
                  aria-label="Finance team"
                />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-(--text-primary)">Assignment strategy</label>
              <select
                value={strategy}
                onChange={(e) => setStrategy(e.target.value as AssignmentStrategy)}
                disabled={submitting}
                className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
              >
                {strategyOpts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            {strategy === AssignmentStrategy.SPECIFIC_MEMBER ? (
              <div>
                <label className="text-sm font-medium text-(--text-primary)">Assign to member</label>
                <div className="mt-1.5">
                  <SearchableSelect
                    options={memSelOpts}
                    value={specificMembershipId}
                    onChange={setSpecificMembershipId}
                    disabled={submitting}
                    placeholder="Search members…"
                    aria-label="Specific member"
                  />
                </div>
              </div>
            ) : null}
          </>
        )}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm"
          >
            {error}
            <PlanGateBanner
              variant="modal"
              visible={showBillingLink}
              description={null}
            />
          </div>
        ) : null}
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="rounded-lg border border-(--border-subtle) px-4 py-2 text-sm disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={submitting || loading || diffEmpty}
            className="inline-flex items-center gap-2 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? <Spinner size="sm" /> : null}
            Save
          </button>
        </div>
      </form>
    </Dialog>
  );
}
