"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApprovalEscalationPolicy,
  ApprovalRoutingMode,
  ApprovalRoutingRuleStatus,
  ApproverTargetType,
  ConditionField,
  ConditionOperator,
  type FinanceResponsibility,
  type WorkspaceRole,
} from "@prisma/client";
import { PlanGateBanner } from "@/components/ui/plan-gate";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { isUpgradeRequiredFromApiResponse } from "@/lib/plan-gate-detection";
import { validateConditionShape } from "@/lib/validations/finance-assignment-rule";
import { evaluateApprovalRoutingPlanGate } from "@/lib/validations/approval-routing-rule";
import { VISIBLE_CONDITION_FIELDS } from "@/lib/approval-routing-rule-labels";
import {
  fetchActiveWorkspaceMembers,
  fetchFinanceTeamsDirectory,
  membersToUserAndMembershipOptions,
} from "@/lib/workspace-directory-fetch";
import { draftToConditionPayload } from "./assignment-rule-create-modal";
import type { ConditionRowDraft } from "./rule-condition-row";
import { newApproverDraft, serializeRequiredApprovers, type ApproverRowDraft } from "./approval-rule-approver-row";
import { ApprovalRoutingRuleFormFields } from "./approval-routing-rule-form-fields";
import type { ApprovalRoutingPlanSnapshot } from "./approval-routing-rules-section";

type ApiCondition = {
  id: string;
  field: ConditionField;
  operator: ConditionOperator;
  valueString: string | null;
  valueNumber: number | null;
  valueJson: unknown;
  customFieldKey: string | null;
};

type ApiApprover = {
  id: string;
  sequenceOrder: number;
  targetType: ApproverTargetType;
  targetMembershipId: string | null;
  targetWorkspaceRole: string | null;
  targetFinanceResponsibility: string | null;
  targetTeamId: string | null;
  requireAll: boolean;
};

export type ApprovalRoutingRuleDetail = {
  id: string;
  name: string;
  description: string | null;
  priority: number;
  mode: ApprovalRoutingMode;
  status: ApprovalRoutingRuleStatus;
  escalationPolicy: ApprovalEscalationPolicy;
  escalationHours: number | null;
  escalationTargetMembershipId: string | null;
  triggerOnCreate: boolean;
  triggerOnAmountChange: boolean;
  createdAt?: string;
  updatedAt?: string;
  deletedAt?: string | null;
  conditions: ApiCondition[];
  requiredApprovers: ApiApprover[];
};

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

function condPayloadFromApi(c: ApiCondition): Record<string, unknown> {
  const o: Record<string, unknown> = { field: c.field, operator: c.operator };
  if (c.valueString != null) o.valueString = c.valueString;
  if (c.valueNumber != null) o.valueNumber = c.valueNumber;
  if (c.valueJson !== undefined && c.valueJson !== null) o.valueJson = c.valueJson;
  if (c.customFieldKey) o.customFieldKey = c.customFieldKey;
  return o;
}

function stableJson(v: unknown): string {
  return JSON.stringify(v);
}

function apiConditionToRowDraft(c: ApiCondition): ConditionRowDraft | null {
  const vis = VISIBLE_CONDITION_FIELDS as readonly ConditionField[];
  if (!vis.includes(c.field)) return null;
  const clientId = crypto.randomUUID();
  const base: ConditionRowDraft = {
    clientId,
    field: c.field,
    operator: c.operator,
  };
  if (c.operator === "IS_NULL" || c.operator === "IS_NOT_NULL") return base;
  if (c.field === "REQUESTED_AMOUNT") {
    if (c.operator === "BETWEEN") {
      const pair = Array.isArray(c.valueJson) ? c.valueJson : null;
      return { ...base, valueJson: pair ?? undefined };
    }
    if (c.operator === "IN" || c.operator === "NOT_IN") {
      const arr = Array.isArray(c.valueJson) ? (c.valueJson as number[]) : [];
      return { ...base, amountListComma: arr.join(", ") };
    }
    return { ...base, valueNumber: c.valueNumber ?? undefined };
  }
  if (c.field === "CURRENCY_CODE") {
    if (c.operator === "IN" || c.operator === "NOT_IN") {
      const arr = Array.isArray(c.valueJson) ? (c.valueJson as string[]) : [];
      return { ...base, currencyListComma: arr.join(", ") };
    }
    return { ...base, valueString: c.valueString ?? undefined };
  }
  if (c.field === "RECORD_TYPE") {
    if (c.operator === "IN" || c.operator === "NOT_IN") {
      const arr = Array.isArray(c.valueJson) ? (c.valueJson as string[]) : [];
      return { ...base, valueJson: arr };
    }
    return { ...base, valueString: c.valueString ?? undefined };
  }
  if (c.field === "DEPARTMENT_ID" || c.field === "COST_CENTER_ID" || c.field === "CREATED_BY_USER_ID") {
    if (c.operator === "IN" || c.operator === "NOT_IN") {
      const arr = Array.isArray(c.valueJson) ? (c.valueJson as string[]) : [];
      return { ...base, valueJson: arr };
    }
    return { ...base, valueString: c.valueString ?? undefined };
  }
  return null;
}

function apiApproverToDraft(a: ApiApprover): ApproverRowDraft {
  return {
    clientId: crypto.randomUUID(),
    targetType: a.targetType,
    targetMembershipId: a.targetMembershipId ?? "",
    targetWorkspaceRole: (a.targetWorkspaceRole as WorkspaceRole | null) ?? "MEMBER",
    targetFinanceResponsibility:
      (a.targetFinanceResponsibility as FinanceResponsibility | null) ?? "",
    targetTeamId: a.targetTeamId ?? "",
  };
}

type ScalarBaseline = {
  name: string;
  description: string | null;
  priority: number;
  mode: ApprovalRoutingMode;
  status: ApprovalRoutingRuleStatus;
  escalationPolicy: ApprovalEscalationPolicy;
  escalationHours: number | null;
  escalationTargetMembershipId: string | null;
  triggerOnCreate: boolean;
  triggerOnAmountChange: boolean;
};

type Props = {
  open: boolean;
  ruleId: string | null;
  onClose: () => void;
  onSuccess: (updated: ApprovalRoutingRuleDetail) => void;
  onPlanBlocked: () => void;
  planApprovalRouting: ApprovalRoutingPlanSnapshot;
};

export function ApprovalRoutingRuleEditModal({
  open,
  ruleId,
  onClose,
  onSuccess,
  onPlanBlocked,
  planApprovalRouting,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [baseline, setBaseline] = useState<ScalarBaseline | null>(null);
  const [baselineCondJson, setBaselineCondJson] = useState<string>("");
  const [baselineApprJson, setBaselineApprJson] = useState<string>("");
  const [unsupportedConditions, setUnsupportedConditions] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("100");
  const [mode, setMode] = useState<ApprovalRoutingMode>(ApprovalRoutingMode.PARALLEL);
  const [status, setStatus] = useState<ApprovalRoutingRuleStatus>(ApprovalRoutingRuleStatus.ACTIVE);
  const [escalationPolicy, setEscalationPolicy] = useState<ApprovalEscalationPolicy>(
    ApprovalEscalationPolicy.NONE,
  );
  const [escalationHours, setEscalationHours] = useState("");
  const [escalationTargetMembershipId, setEscalationTargetMembershipId] = useState("");
  const [triggerOnCreate, setTriggerOnCreate] = useState(true);
  const [triggerOnAmountChange, setTriggerOnAmountChange] = useState(false);
  const [conditions, setConditions] = useState<ConditionRowDraft[]>([]);
  const [approvers, setApprovers] = useState<ApproverRowDraft[]>([]);

  const [deptOptions, setDeptOptions] = useState<{ value: string; label: string }[]>([]);
  const [ccOptions, setCcOptions] = useState<{ value: string; label: string }[]>([]);
  const [memberUserOptions, setMemberUserOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [membershipOptions, setMembershipOptions] = useState<{ value: string; label: string }[]>(
    [],
  );
  const [teamOptions, setTeamOptions] = useState<{ value: string; label: string }[]>([]);

  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBillingLink, setShowBillingLink] = useState(false);

  const loadRefs = useCallback(async () => {
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
    setDeptOptions((deptJson.data?.departments ?? []).map((d) => ({ value: d.id, label: d.name })));
    setCcOptions(
      (ccJson.data?.costCenters ?? []).map((c) => ({
        value: c.id,
        label: `${c.code} — ${c.name}`,
      })),
    );
    const teamsAgg = await fetchFinanceTeamsDirectory(apiFetch);
    setTeamOptions(teamsAgg.map((t) => ({ value: t.id, label: t.name })));
    const membersAgg = await fetchActiveWorkspaceMembers(apiFetch);
    const { userOptions, membershipOptions: memOpts } =
      membersToUserAndMembershipOptions(membersAgg);
    setMemberUserOptions(userOptions);
    setMembershipOptions(memOpts);
  }, [apiFetch]);

  useEffect(() => {
    if (!open || !ruleId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      setShowBillingLink(false);
      setUnsupportedConditions(false);
      await loadRefs();
      const res = await apiFetch(`/api/tenant/approval-routing-rules/${ruleId}`, {
        showToastOnError: false,
      });
      const data = (await res.json().catch(() => ({}))) as { data?: ApprovalRoutingRuleDetail };
      if (cancelled) return;
      if (!res.ok || !data.data) {
        setError("Could not load rule.");
        setBaseline(null);
        setLoading(false);
        return;
      }
      const r = data.data;
      const drafts: ConditionRowDraft[] = [];
      let bad = false;
      for (const c of r.conditions) {
        const d = apiConditionToRowDraft(c);
        if (!d) {
          bad = true;
          break;
        }
        drafts.push(d);
      }
      if (bad) {
        setUnsupportedConditions(true);
        setBaseline(null);
        setLoading(false);
        return;
      }
      const apprDrafts =
        r.requiredApprovers.length > 0
          ? r.requiredApprovers.map(apiApproverToDraft)
          : [newApproverDraft()];
      const b: ScalarBaseline = {
        name: r.name,
        description: r.description,
        priority: r.priority,
        mode: r.mode,
        status: r.status,
        escalationPolicy: r.escalationPolicy,
        escalationHours: r.escalationHours,
        escalationTargetMembershipId: r.escalationTargetMembershipId,
        triggerOnCreate: r.triggerOnCreate,
        triggerOnAmountChange: r.triggerOnAmountChange,
      };
      setBaseline(b);
      setName(b.name);
      setDescription(b.description ?? "");
      setPriority(String(b.priority));
      setMode(b.mode);
      setStatus(b.status);
      setEscalationPolicy(b.escalationPolicy);
      setEscalationHours(
        b.escalationHours != null && Number.isFinite(b.escalationHours)
          ? String(b.escalationHours)
          : "",
      );
      setEscalationTargetMembershipId(b.escalationTargetMembershipId ?? "");
      setTriggerOnCreate(b.triggerOnCreate);
      setTriggerOnAmountChange(b.triggerOnAmountChange);
      setConditions(drafts);
      setApprovers(apprDrafts);
      setBaselineCondJson(
        stableJson(r.conditions.map((c) => condPayloadFromApi(c))),
      );
      setBaselineApprJson(
        stableJson(serializeRequiredApprovers(r.mode, apprDrafts)),
      );
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, ruleId, apiFetch, loadRefs]);

  const formScalar = useMemo((): ScalarBaseline => {
    const pr = Math.floor(Number(priority.trim()) || 0);
    const escH =
      escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS &&
      escalationHours.trim() !== ""
        ? Math.floor(Number(escalationHours.trim()))
        : null;
    return {
      name: name.trim(),
      description: description.trim() === "" ? null : description.trim(),
      priority: pr,
      mode,
      status,
      escalationPolicy,
      escalationHours: escalationPolicy === ApprovalEscalationPolicy.NONE ? null : escH,
      escalationTargetMembershipId:
        escalationPolicy === ApprovalEscalationPolicy.NONE
          ? null
          : escalationTargetMembershipId.trim() || null,
      triggerOnCreate,
      triggerOnAmountChange,
    };
  }, [
    name,
    description,
    priority,
    mode,
    status,
    escalationPolicy,
    escalationHours,
    escalationTargetMembershipId,
    triggerOnCreate,
    triggerOnAmountChange,
  ]);

  const currentCondPayloads = useMemo(() => {
    const out: NonNullable<ReturnType<typeof draftToConditionPayload>>[] = [];
    for (const d of conditions) {
      const p = draftToConditionPayload(d);
      if (!p) return null;
      out.push(p);
    }
    return out;
  }, [conditions]);

  const currentApprSerialized = useMemo(
    () => serializeRequiredApprovers(mode, approvers),
    [mode, approvers],
  );

  const conditionsDirty =
    currentCondPayloads != null &&
    stableJson(currentCondPayloads) !== baselineCondJson;
  const approversDirty = stableJson(currentApprSerialized) !== baselineApprJson;

  const computeScalarPatch = (b: ScalarBaseline, f: ScalarBaseline): Record<string, unknown> => {
    const p: Record<string, unknown> = {};
    if (f.name !== b.name) p.name = f.name;
    const d0 = b.description ?? null;
    const d1 = f.description ?? null;
    if (d0 !== d1) p.description = f.description;
    if (f.priority !== b.priority) p.priority = f.priority;
    if (f.mode !== b.mode) p.mode = f.mode;
    if (f.status !== b.status) p.status = f.status;
    if (f.triggerOnCreate !== b.triggerOnCreate) p.triggerOnCreate = f.triggerOnCreate;
    if (f.triggerOnAmountChange !== b.triggerOnAmountChange) {
      p.triggerOnAmountChange = f.triggerOnAmountChange;
    }
    const escChanged =
      f.escalationPolicy !== b.escalationPolicy ||
      (f.escalationHours ?? null) !== (b.escalationHours ?? null) ||
      (f.escalationTargetMembershipId ?? null) !== (b.escalationTargetMembershipId ?? null);
    if (escChanged) {
      p.escalationPolicy = f.escalationPolicy;
      if (f.escalationPolicy === ApprovalEscalationPolicy.NONE) {
        p.escalationHours = null;
        p.escalationTargetMembershipId = null;
      } else if (f.escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS) {
        p.escalationHours = f.escalationHours;
        p.escalationTargetMembershipId = f.escalationTargetMembershipId;
      } else {
        p.escalationTargetMembershipId = f.escalationTargetMembershipId;
      }
    }
    return p;
  };

  const patchEmpty = useMemo(() => {
    if (!baseline || unsupportedConditions || currentCondPayloads == null) return true;
    const scalar = computeScalarPatch(baseline, formScalar);
    const hasScalar = Object.keys(scalar).length > 0;
    return !hasScalar && !conditionsDirty && !approversDirty;
  }, [
    baseline,
    formScalar,
    conditionsDirty,
    approversDirty,
    unsupportedConditions,
    currentCondPayloads,
  ]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!baseline || !ruleId || unsupportedConditions || currentCondPayloads == null) return;
    const n = name.trim();
    if (!n) {
      setError("Name is required.");
      return;
    }
    if (!Number.isFinite(formScalar.priority) || formScalar.priority < 1 || formScalar.priority > 1000) {
      setError("Priority must be between 1 and 1000.");
      return;
    }
    if (conditions.length < 1) {
      setError("Add at least one condition.");
      return;
    }
    for (const p of currentCondPayloads) {
      const err = validateConditionShape(p);
      if (err) {
        setError(shapeErrorMessage(err));
        return;
      }
    }
    for (const a of approvers) {
      if (a.targetType === ApproverTargetType.SPECIFIC_USER && !a.targetMembershipId.trim()) {
        setError("Each approver must be fully configured.");
        return;
      }
      if (a.targetType === ApproverTargetType.TEAM && !a.targetTeamId.trim()) {
        setError("Each approver must be fully configured.");
        return;
      }
    }
    if (formScalar.escalationPolicy !== ApprovalEscalationPolicy.NONE) {
      if (formScalar.escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS) {
        if (formScalar.escalationHours == null || formScalar.escalationHours < 1) {
          setError("Enter escalation hours (at least 1).");
          return;
        }
      }
      if (!formScalar.escalationTargetMembershipId) {
        setError("Select an escalation target member.");
        return;
      }
    }

    const mergedMode = formScalar.mode;
    const mergedEsc = formScalar.escalationPolicy;
    const condFields: ConditionField[] = conditionsDirty
      ? currentCondPayloads.map((x) => x.field)
      : (JSON.parse(baselineCondJson) as { field: ConditionField }[]).map((x) => x.field);
    const gate = evaluateApprovalRoutingPlanGate(planApprovalRouting, {
      mode: mergedMode,
      escalationPolicy: mergedEsc,
      conditionFields: condFields,
    });
    if (!gate.ok) {
      setError(
        gate.reason === "not_enabled"
          ? "Approval routing is not available on your plan."
          : gate.reason === "sequential"
            ? "Sequential approval routing requires a higher plan."
            : gate.reason === "escalation"
              ? "Approval escalation requires a higher plan."
              : gate.reason === "custom_field"
                ? "Custom field conditions require a higher plan."
                : "Your plan does not allow this configuration.",
      );
      onPlanBlocked();
      setShowBillingLink(true);
      return;
    }

    const patch = computeScalarPatch(baseline, formScalar);
    if (conditionsDirty) patch.conditions = currentCondPayloads;
    if (approversDirty) patch.requiredApprovers = currentApprSerialized;

    if (Object.keys(patch).length === 0) return;

    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch(`/api/tenant/approval-routing-rules/${ruleId}`, {
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
              "Upgrade your plan to update this rule.",
          );
          return;
        }
        if (res.status === 404) {
          setError("This rule no longer exists.");
          return;
        }
        if (res.status === 409) {
          setError("A rule with this name already exists.");
          return;
        }
        setError(
          (data as { error?: { message?: string } }).error?.message ?? "Could not update rule.",
        );
        return;
      }
      const updated = (data as { data?: ApprovalRoutingRuleDetail }).data;
      if (updated) {
        toast.addToast("success", "Approval routing rule updated.");
        onSuccess(updated);
        onClose();
      }
    } catch {
      setError("Something went wrong.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!open || !ruleId) return null;

  return (
    <Dialog
      open={open}
      onClose={() => !submitting && onClose()}
      title="Edit approval routing rule"
      closeDisabled={submitting}
      contentClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {unsupportedConditions ? (
          <p className="text-sm text-(--color-danger)">
            This rule includes conditions that cannot be edited in the workspace UI yet. Remove or
            change them via a supported workflow, or contact support.
          </p>
        ) : null}
        {loading ? (
          <div className="flex justify-center py-8">
            <Spinner />
          </div>
        ) : !baseline ? (
          !unsupportedConditions ? (
            <p className="text-sm text-(--text-secondary)">Could not load this rule.</p>
          ) : null
        ) : (
          <ApprovalRoutingRuleFormFields
            disabled={submitting || unsupportedConditions}
            name={name}
            setName={setName}
            description={description}
            setDescription={setDescription}
            priority={priority}
            setPriority={setPriority}
            status={status}
            setStatus={setStatus}
            mode={mode}
            setMode={setMode}
            escalationPolicy={escalationPolicy}
            setEscalationPolicy={setEscalationPolicy}
            escalationHours={escalationHours}
            setEscalationHours={setEscalationHours}
            escalationTargetMembershipId={escalationTargetMembershipId}
            setEscalationTargetMembershipId={setEscalationTargetMembershipId}
            triggerOnCreate={triggerOnCreate}
            setTriggerOnCreate={setTriggerOnCreate}
            triggerOnAmountChange={triggerOnAmountChange}
            setTriggerOnAmountChange={setTriggerOnAmountChange}
            conditions={conditions}
            setConditions={setConditions}
            approvers={approvers}
            setApprovers={setApprovers}
            deptOptions={deptOptions}
            ccOptions={ccOptions}
            memberUserOptions={memberUserOptions}
            membershipOptions={membershipOptions}
            teamOptions={teamOptions}
          />
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
            disabled={submitting || loading || patchEmpty || unsupportedConditions}
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
