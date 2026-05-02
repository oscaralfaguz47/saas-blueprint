"use client";

import type { Dispatch, SetStateAction } from "react";
import {
  ApprovalEscalationPolicy,
  ApprovalRoutingMode,
  ApprovalRoutingRuleStatus,
} from "@prisma/client";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  ESCALATION_POLICY_LABELS,
  FIELD_LABELS,
  OPERATOR_LABELS,
  RECORD_TYPE_LABELS,
  ROUTING_MODE_LABELS,
  ROUTING_STATUS_LABELS,
  VISIBLE_CONDITION_FIELDS,
  defaultOperatorForField,
  operatorsForField,
  recordTypeSelectOptions,
} from "@/lib/approval-routing-rule-labels";
import { RuleConditionRow, type ConditionRowDraft } from "./rule-condition-row";
import {
  ApprovalRuleApproverRow,
  newApproverDraft,
  type ApproverRowDraft,
} from "./approval-rule-approver-row";

export function newRoutingRuleConditionDraft(): ConditionRowDraft {
  return {
    clientId: crypto.randomUUID(),
    field: "RECORD_TYPE",
    operator: "EQUALS",
  };
}

type Props = {
  disabled: boolean;
  name: string;
  setName: Dispatch<SetStateAction<string>>;
  description: string;
  setDescription: Dispatch<SetStateAction<string>>;
  priority: string;
  setPriority: Dispatch<SetStateAction<string>>;
  status: ApprovalRoutingRuleStatus;
  setStatus: Dispatch<SetStateAction<ApprovalRoutingRuleStatus>>;
  mode: ApprovalRoutingMode;
  setMode: Dispatch<SetStateAction<ApprovalRoutingMode>>;
  escalationPolicy: ApprovalEscalationPolicy;
  setEscalationPolicy: Dispatch<SetStateAction<ApprovalEscalationPolicy>>;
  escalationHours: string;
  setEscalationHours: Dispatch<SetStateAction<string>>;
  escalationTargetMembershipId: string;
  setEscalationTargetMembershipId: Dispatch<SetStateAction<string>>;
  triggerOnCreate: boolean;
  setTriggerOnCreate: Dispatch<SetStateAction<boolean>>;
  triggerOnAmountChange: boolean;
  setTriggerOnAmountChange: Dispatch<SetStateAction<boolean>>;
  conditions: ConditionRowDraft[];
  setConditions: Dispatch<SetStateAction<ConditionRowDraft[]>>;
  approvers: ApproverRowDraft[];
  setApprovers: Dispatch<SetStateAction<ApproverRowDraft[]>>;
  deptOptions: { value: string; label: string }[];
  ccOptions: { value: string; label: string }[];
  memberUserOptions: { value: string; label: string }[];
  membershipOptions: { value: string; label: string }[];
  teamOptions: { value: string; label: string }[];
  nameRequired?: boolean;
};

export function ApprovalRoutingRuleFormFields({
  disabled,
  name,
  setName,
  description,
  setDescription,
  priority,
  setPriority,
  status,
  setStatus,
  mode,
  setMode,
  escalationPolicy,
  setEscalationPolicy,
  escalationHours,
  setEscalationHours,
  escalationTargetMembershipId,
  setEscalationTargetMembershipId,
  triggerOnCreate,
  setTriggerOnCreate,
  triggerOnAmountChange,
  setTriggerOnAmountChange,
  conditions,
  setConditions,
  approvers,
  setApprovers,
  deptOptions,
  ccOptions,
  memberUserOptions,
  membershipOptions,
  teamOptions,
  nameRequired,
}: Props) {
  const modeOpts = (Object.keys(ROUTING_MODE_LABELS) as ApprovalRoutingMode[]).map((m) => ({
    value: m,
    label: ROUTING_MODE_LABELS[m],
  }));
  const statusOpts = (Object.keys(ROUTING_STATUS_LABELS) as ApprovalRoutingRuleStatus[]).map(
    (s) => ({ value: s, label: ROUTING_STATUS_LABELS[s] }),
  );
  const escOpts = (Object.keys(ESCALATION_POLICY_LABELS) as ApprovalEscalationPolicy[]).map(
    (x) => ({ value: x, label: ESCALATION_POLICY_LABELS[x] }),
  );
  const escMemOpts = [{ value: "", label: "Select member…" }, ...membershipOptions];

  const updateCondition = (clientId: string, next: ConditionRowDraft) => {
    setConditions((prev) => prev.map((c) => (c.clientId === clientId ? next : c)));
  };
  const removeCondition = (clientId: string) => {
    setConditions((prev) => prev.filter((c) => c.clientId !== clientId));
  };
  const updateApprover = (clientId: string, next: ApproverRowDraft) => {
    setApprovers((prev) => prev.map((a) => (a.clientId === clientId ? next : a)));
  };
  const removeApprover = (clientId: string) => {
    setApprovers((prev) => (prev.length <= 1 ? prev : prev.filter((a) => a.clientId !== clientId)));
  };
  const moveApprover = (idx: number, dir: -1 | 1) => {
    setApprovers((prev) => {
      const j = idx + dir;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[j]] = [next[j], next[idx]];
      return next;
    });
  };

  return (
    <>
      <div>
        <label className="text-sm font-medium text-(--text-primary)">Name</label>
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={120}
          disabled={disabled}
          className="mt-1.5"
          required={nameRequired}
        />
      </div>
      <div>
        <label className="text-sm font-medium text-(--text-primary)">Description</label>
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={500}
          disabled={disabled}
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
            disabled={disabled}
            className="mt-1.5"
          />
        </div>
        <div>
          <label className="text-sm font-medium text-(--text-primary)">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as ApprovalRoutingRuleStatus)}
            disabled={disabled}
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
        <label className="text-sm font-medium text-(--text-primary)">Routing mode</label>
        <select
          value={mode}
          onChange={(e) => setMode(e.target.value as ApprovalRoutingMode)}
          disabled={disabled}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
        >
          {modeOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="text-sm font-medium text-(--text-primary)">Escalation</label>
        <select
          value={escalationPolicy}
          onChange={(e) => setEscalationPolicy(e.target.value as ApprovalEscalationPolicy)}
          disabled={disabled}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
        >
          {escOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      {escalationPolicy !== ApprovalEscalationPolicy.NONE ? (
        <div className="grid gap-3 sm:grid-cols-2">
          {escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS ? (
            <div>
              <label className="text-sm font-medium text-(--text-primary)">
                Hours until escalation
              </label>
              <Input
                type="number"
                min={1}
                value={escalationHours}
                onChange={(e) => setEscalationHours(e.target.value)}
                disabled={disabled}
                className="mt-1.5"
              />
            </div>
          ) : (
            <div />
          )}
          <div
            className={
              escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS
                ? ""
                : "sm:col-span-2"
            }
          >
            <label className="text-sm font-medium text-(--text-primary)">
              Escalation target (member)
            </label>
            <div className="mt-1.5">
              <SearchableSelect
                options={escMemOpts}
                value={escalationTargetMembershipId}
                onChange={setEscalationTargetMembershipId}
                disabled={disabled}
                placeholder="Search members…"
                aria-label="Escalation target"
              />
            </div>
          </div>
        </div>
      ) : null}
      <div className="flex flex-col gap-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
          <input
            type="checkbox"
            checked={triggerOnCreate}
            onChange={(e) => setTriggerOnCreate(e.target.checked)}
            disabled={disabled}
            className="rounded border-(--border-subtle)"
          />
          Trigger when record is created
        </label>
        <label className="flex cursor-pointer items-center gap-2 text-sm text-(--text-primary)">
          <input
            type="checkbox"
            checked={triggerOnAmountChange}
            onChange={(e) => setTriggerOnAmountChange(e.target.checked)}
            disabled={disabled}
            className="rounded border-(--border-subtle)"
          />
          <span className="inline-flex items-center gap-1">
            Trigger when amount changes
            <abbr
              title="Re-evaluates routing when the requested amount changes. May reassign approvers; use with care."
              className="cursor-help text-(--text-muted) no-underline"
            >
              (?)
            </abbr>
          </span>
        </label>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-(--text-primary)">Conditions</span>
          <button
            type="button"
            disabled={disabled || conditions.length >= 20}
            onClick={() => setConditions((prev) => [...prev, newRoutingRuleConditionDraft()])}
            className="text-sm font-medium text-(--color-primary) hover:underline disabled:opacity-50"
          >
            Add condition
          </button>
        </div>
        <p className="mt-1 text-xs text-(--text-muted)">Up to 20 conditions. All must match.</p>
        <div className="mt-2 space-y-2">
          {conditions.map((c) => (
            <RuleConditionRow
              key={c.clientId}
              row={c}
              onChange={(next) => updateCondition(c.clientId, next)}
              onRemove={() => removeCondition(c.clientId)}
              departmentOptions={deptOptions}
              costCenterOptions={ccOptions}
              memberOptions={memberUserOptions}
              visibleFields={VISIBLE_CONDITION_FIELDS}
              fieldLabels={FIELD_LABELS}
              operatorLabels={OPERATOR_LABELS}
              operatorsForField={operatorsForField}
              defaultOperatorForField={defaultOperatorForField}
              recordTypeSelectOptions={recordTypeSelectOptions()}
              recordTypeLabels={RECORD_TYPE_LABELS}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-(--text-primary)">Required approvers</span>
          <button
            type="button"
            disabled={disabled}
            onClick={() => setApprovers((prev) => [...prev, newApproverDraft()])}
            className="text-sm font-medium text-(--color-primary) hover:underline disabled:opacity-50"
          >
            Add approver
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {approvers.map((a, idx) => (
            <ApprovalRuleApproverRow
              key={a.clientId}
              row={a}
              mode={mode}
              stepIndex={idx}
              membershipOptions={membershipOptions}
              teamOptions={teamOptions}
              onChange={(next) => updateApprover(a.clientId, next)}
              onRemove={() => removeApprover(a.clientId)}
              onMoveUp={mode === "SEQUENTIAL" ? () => moveApprover(idx, -1) : undefined}
              onMoveDown={mode === "SEQUENTIAL" ? () => moveApprover(idx, 1) : undefined}
              disabled={disabled}
            />
          ))}
        </div>
      </div>
    </>
  );
}
