"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  AssignmentRuleStatus,
  AssignmentStrategy,
  ConditionField,
  ConditionOperator,
} from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Spinner } from "@/components/ui/spinner";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { validateConditionShape } from "@/lib/validations/finance-assignment-rule";
import { STRATEGY_LABELS, STATUS_LABELS } from "@/lib/assignment-rule-labels";
import {
  fetchActiveWorkspaceMembers,
  fetchFinanceTeamsDirectory,
  membersToUserAndMembershipOptions,
} from "@/lib/workspace-directory-fetch";
import {
  AssignmentRuleConditionRow,
  type ConditionDraft,
} from "./assignment-rule-condition-row";

function newRow(): ConditionDraft {
  return {
    clientId: crypto.randomUUID(),
    field: "RECORD_TYPE",
    operator: "EQUALS",
  };
}

function isUpgradeRequiredPayload(data: unknown): boolean {
  const err = (data as { error?: { details?: unknown } } | null)?.error;
  const d = err?.details;
  return typeof d === "object" && d !== null && (d as { code?: string }).code === "UPGRADE_REQUIRED";
}

function shapeErrorMessage(code: string): string {
  const m: Record<string, string> = {
    NULL_OPERATOR_REJECTS_VALUE: "Empty operators cannot have a value.",
    BETWEEN_REQUIRES_TWO_VALUES_JSON: "Between requires two numbers.",
    BETWEEN_REQUIRES_NUMERIC_PAIR: "Between values must be valid numbers.",
    IN_OPERATOR_REQUIRES_ARRAY_JSON: "List cannot be empty.",
    IN_OPERATOR_REQUIRES_NUMERIC_ARRAY: "Use comma-separated numbers.",
    NUMERIC_FIELD_REQUIRES_VALUE_NUMBER: "Enter a valid amount.",
    RECORD_TYPE_IN_REQUIRES_ENUM_ARRAY: "Invalid record type in list.",
    ID_FIELD_IN_REQUIRES_CUID_ARRAY: "Invalid id in list.",
    STRING_FIELD_IN_REQUIRES_NONEMPTY_STRING_ARRAY: "List entries cannot be empty.",
    RECORD_TYPE_REQUIRES_ENUM_STRING: "Select a record type.",
    STRING_FIELD_REQUIRES_VALUE_STRING: "Enter a value.",
    ID_FIELD_REQUIRES_CUID_STRING: "Select a valid item.",
    UNSUPPORTED_FIELD_OPERATOR: "This field and operator cannot be combined.",
  };
  return m[code] ?? `Invalid condition (${code}).`;
}

/** Build API-shaped condition from draft; returns null if incomplete. */
export function draftToConditionPayload(d: ConditionDraft): {
  field: ConditionField;
  operator: ConditionOperator;
  valueString?: string;
  valueNumber?: number;
  valueJson?: unknown;
} | null {
  const { field, operator: op } = d;
  if (op === "IS_NULL" || op === "IS_NOT_NULL") {
    return { field, operator: op };
  }
  if (field === "REQUESTED_AMOUNT") {
    if (op === "BETWEEN") {
      const j = d.valueJson;
      if (!Array.isArray(j) || j.length !== 2) return null;
      const a = Number(j[0]);
      const b = Number(j[1]);
      if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
      return { field, operator: op, valueJson: [a, b] };
    }
    if (op === "IN" || op === "NOT_IN") {
      const raw = d.amountListComma?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
      if (raw.length === 0) return null;
      const nums = raw.map((x) => Number(x));
      if (!nums.every((n) => Number.isFinite(n))) return null;
      return { field, operator: op, valueJson: nums };
    }
    if (d.valueNumber === undefined || !Number.isFinite(d.valueNumber)) return null;
    return { field, operator: op, valueNumber: d.valueNumber };
  }
  if (field === "CURRENCY_CODE") {
    if (op === "IN" || op === "NOT_IN") {
      const codes =
        d.currencyListComma?.split(",").map((s) => s.trim().toUpperCase()).filter(Boolean) ?? [];
      if (codes.length === 0) return null;
      return { field, operator: op, valueJson: codes };
    }
    if (!d.valueString?.trim()) return null;
    return { field, operator: op, valueString: d.valueString.trim() };
  }
  if (field === "RECORD_TYPE") {
    if (op === "IN" || op === "NOT_IN") {
      const arr = Array.isArray(d.valueJson) ? (d.valueJson as string[]) : [];
      if (arr.length === 0) return null;
      return { field, operator: op, valueJson: arr };
    }
    if (!d.valueString) return null;
    return { field, operator: op, valueString: d.valueString };
  }
  if (field === "DEPARTMENT_ID" || field === "COST_CENTER_ID" || field === "CREATED_BY_USER_ID") {
    if (op === "IN" || op === "NOT_IN") {
      const arr = Array.isArray(d.valueJson) ? (d.valueJson as string[]) : [];
      if (arr.length === 0) return null;
      return { field, operator: op, valueJson: arr };
    }
    if (!d.valueString?.trim()) return null;
    return { field, operator: op, valueString: d.valueString.trim() };
  }
  return null;
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onPlanBlocked: () => void;
};

export function AssignmentRuleCreateModal({ open, onClose, onSuccess, onPlanBlocked }: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("100");
  const [teamId, setTeamId] = useState("");
  const [strategy, setStrategy] = useState<AssignmentStrategy>(AssignmentStrategy.ROUND_ROBIN);
  const [specificMembershipId, setSpecificMembershipId] = useState("");
  const [status, setStatus] = useState<AssignmentRuleStatus>(AssignmentRuleStatus.ACTIVE);
  const [conditions, setConditions] = useState<ConditionDraft[]>([]);
  const [teamOptions, setTeamOptions] = useState<{ value: string; label: string }[]>([]);
  const [deptOptions, setDeptOptions] = useState<{ value: string; label: string }[]>([]);
  const [ccOptions, setCcOptions] = useState<{ value: string; label: string }[]>([]);
  /** Picker values are user ids (Record.createdByUserId). */
  const [memberUserOptions, setMemberUserOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [membershipOptions, setMembershipOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [loadingRefs, setLoadingRefs] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBillingLink, setShowBillingLink] = useState(false);

  const loadReferenceData = useCallback(async () => {
    setLoadingRefs(true);
    try {
      const [deptRes, ccRes] = await Promise.all([
        apiFetch("/api/tenant/departments?activeOnly=true", { showToastOnError: false }),
        apiFetch("/api/tenant/cost-centers?activeOnly=true", { showToastOnError: false }),
      ]);
      const deptJson = (await deptRes.json().catch(() => ({}))) as {
        data?: { departments?: { id: string; name: string }[] };
      };
      const ccJson = (await ccRes.json().catch(() => ({}))) as {
        data?: { costCenters?: { id: string; code: string; name: string }[] };
      };
      setDeptOptions(
        (deptJson.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name })),
      );
      setCcOptions(
        (ccJson.data?.costCenters ?? []).map((c) => ({
          value: c.id,
          label: `${c.code} — ${c.name}`,
        })),
      );

      const teamsAgg = await fetchFinanceTeamsDirectory(apiFetch);
      setTeamOptions(teamsAgg.map((t) => ({ value: t.id, label: t.name })));
      const membersAgg = await fetchActiveWorkspaceMembers(apiFetch);
      const { userOptions, membershipOptions } = membersToUserAndMembershipOptions(membersAgg);
      setMemberUserOptions(userOptions);
      setMembershipOptions(membershipOptions);
    } finally {
      setLoadingRefs(false);
    }
  }, [apiFetch]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setName("");
    setDescription("");
    setPriority("100");
    setTeamId("");
    setStrategy(AssignmentStrategy.ROUND_ROBIN);
    setSpecificMembershipId("");
    setStatus(AssignmentRuleStatus.ACTIVE);
    setConditions([]);
    setShowBillingLink(false);
    void loadReferenceData();
  }, [open, loadReferenceData]);

  const updateCondition = (clientId: string, next: ConditionDraft) => {
    setConditions((prev) => prev.map((c) => (c.clientId === clientId ? next : c)));
  };

  const removeCondition = (clientId: string) => {
    setConditions((prev) => prev.filter((c) => c.clientId !== clientId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
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

    const payloads: ReturnType<typeof draftToConditionPayload>[] = [];
    for (const d of conditions) {
      const p = draftToConditionPayload(d);
      if (!p) {
        setError("Complete every condition row, or remove incomplete rows.");
        return;
      }
      const err = validateConditionShape(p);
      if (err) {
        setError(shapeErrorMessage(err));
        return;
      }
      payloads.push(p);
    }

    setError(null);
    setSubmitting(true);
    try {
      const body: Record<string, unknown> = {
        name: n,
        priority: Math.floor(pr),
        teamId,
        strategy,
        status,
        conditions: payloads,
      };
      const desc = description.trim();
      if (desc) body.description = desc;
      if (strategy === AssignmentStrategy.SPECIFIC_MEMBER) {
        body.specificMembershipId = specificMembershipId.trim();
      }

      const res = await apiFetch("/api/tenant/finance-assignment-rules", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        showToastOnError: false,
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (isUpgradeRequiredPayload(data)) {
          onPlanBlocked();
          setShowBillingLink(true);
          setError(
            (data as { error?: { message?: string } }).error?.message ??
              "Upgrade your plan to use assignment rules.",
          );
          return;
        }
        const det = (data as { error?: { details?: { code?: string } } }).error?.details;
        if (res.status === 409) {
          setError("An assignment rule with this name already exists.");
          return;
        }
        if (typeof det === "object" && det && det.code === "INVALID_TEAM_REFERENCE") {
          setError("Invalid finance team.");
          return;
        }
        setError(
          (data as { error?: { message?: string } }).error?.message ?? "Could not create rule.",
        );
        return;
      }
      toast.addToast("success", "Assignment rule created.");
      onSuccess();
      onClose();
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

  if (!open) return null;

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      title="Create assignment rule"
      closeDisabled={submitting}
      contentClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {loadingRefs ? (
          <div className="flex items-center gap-2 text-sm text-(--text-muted)">
            <Spinner size="sm" /> Loading…
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
                required
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
            <div>
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-(--text-primary)">Conditions</span>
                <button
                  type="button"
                  disabled={submitting || conditions.length >= 20}
                  onClick={() => setConditions((prev) => [...prev, newRow()])}
                  className="text-sm font-medium text-(--color-primary) hover:underline disabled:opacity-50"
                >
                  Add condition
                </button>
              </div>
              <p className="mt-1 text-xs text-(--text-muted)">Up to 20 conditions. All must match.</p>
              <div className="mt-2 space-y-2">
                {conditions.map((c) => (
                  <AssignmentRuleConditionRow
                    key={c.clientId}
                    row={c}
                    onChange={(next) => updateCondition(c.clientId, next)}
                    onRemove={() => removeCondition(c.clientId)}
                    departmentOptions={deptOptions}
                    costCenterOptions={ccOptions}
                    memberOptions={memberUserOptions}
                    disabled={submitting}
                  />
                ))}
              </div>
            </div>
          </>
        )}
        {error ? (
          <div
            role="alert"
            className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm"
          >
            {error}
            {showBillingLink ? (
              <div className="mt-2">
                <Link
                  href="/app/settings/workspace?tab=billing"
                  className="font-medium text-(--color-primary) hover:underline"
                >
                  View billing and plans
                </Link>
              </div>
            ) : null}
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
            disabled={submitting || loadingRefs}
            className="inline-flex items-center gap-2 rounded-lg bg-(--color-primary) px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
          >
            {submitting ? <Spinner size="sm" /> : null}
            Create
          </button>
        </div>
      </form>
    </Dialog>
  );
}
