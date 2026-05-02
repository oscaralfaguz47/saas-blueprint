"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ApprovalEscalationPolicy,
  ApprovalRoutingMode,
  ApprovalRoutingRuleStatus,
  ApproverTargetType,
  ConditionField,
} from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { validateConditionShape } from "@/lib/validations/finance-assignment-rule";
import { evaluateApprovalRoutingPlanGate } from "@/lib/validations/approval-routing-rule";
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

function isUpgradeRequiredPayload(data: unknown): boolean {
  const err = (data as { error?: { code?: string; details?: unknown } } | null)?.error;
  if (err?.code === "UPGRADE_REQUIRED") return true;
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

function planGateUserMessage(
  r: ReturnType<typeof evaluateApprovalRoutingPlanGate>,
  maxRules: number,
): string {
  if (r.ok) return "";
  switch (r.reason) {
    case "not_enabled":
      return "Approval routing is not available on your plan.";
    case "limit_reached":
      return `You can have at most ${maxRules} rules on your plan.`;
    case "sequential":
      return "Sequential approval routing requires a higher plan.";
    case "escalation":
      return "Approval escalation requires a higher plan.";
    case "custom_field":
      return "Custom field conditions require a higher plan.";
    default:
      return "Your plan does not allow this configuration.";
  }
}

type Props = {
  open: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onPlanBlocked: () => void;
  planApprovalRouting: ApprovalRoutingPlanSnapshot;
  existingRuleCount: number;
};

export function ApprovalRoutingRuleCreateModal({
  open,
  onClose,
  onSuccess,
  onPlanBlocked,
  planApprovalRouting,
  existingRuleCount,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
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
      const { userOptions, membershipOptions: memOpts } =
        membersToUserAndMembershipOptions(membersAgg);
      setMemberUserOptions(userOptions);
      setMembershipOptions(memOpts);
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
    setMode(ApprovalRoutingMode.PARALLEL);
    setStatus(ApprovalRoutingRuleStatus.ACTIVE);
    setEscalationPolicy(ApprovalEscalationPolicy.NONE);
    setEscalationHours("");
    setEscalationTargetMembershipId("");
    setTriggerOnCreate(true);
    setTriggerOnAmountChange(false);
    setConditions([]);
    setApprovers([newApproverDraft()]);
    setShowBillingLink(false);
    void loadReferenceData();
  }, [open, loadReferenceData]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) {
      setError("Name is required.");
      return;
    }
    const pr = Number(priority.trim());
    if (!Number.isFinite(pr) || pr < 1 || pr > 1000) {
      setError("Priority must be between 1 and 1000.");
      return;
    }
    if (conditions.length < 1) {
      setError("Add at least one condition.");
      return;
    }
    const payloads: NonNullable<ReturnType<typeof draftToConditionPayload>>[] = [];
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
    if (escalationPolicy !== ApprovalEscalationPolicy.NONE) {
      const h = Number(escalationHours.trim());
      if (escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS) {
        if (!Number.isFinite(h) || h < 1) {
          setError("Enter escalation hours (at least 1).");
          return;
        }
      }
      if (!escalationTargetMembershipId.trim()) {
        setError("Select an escalation target member.");
        return;
      }
    }

    const condFields = payloads.map((p) => p.field as ConditionField);
    const gate = evaluateApprovalRoutingPlanGate(planApprovalRouting, {
      currentRuleCount: existingRuleCount,
      mode,
      escalationPolicy,
      conditionFields: condFields,
    });
    if (!gate.ok) {
      setError(planGateUserMessage(gate, planApprovalRouting.maxRules));
      onPlanBlocked();
      setShowBillingLink(true);
      return;
    }

    const requiredApprovers = serializeRequiredApprovers(mode, approvers);

    const body: Record<string, unknown> = {
      name: n,
      priority: Math.floor(pr),
      mode,
      status,
      escalationPolicy,
      triggerOnCreate,
      triggerOnAmountChange,
      conditions: payloads,
      requiredApprovers,
    };
    const desc = description.trim();
    if (desc) body.description = desc;
    if (escalationPolicy === ApprovalEscalationPolicy.NONE) {
      body.escalationHours = null;
      body.escalationTargetMembershipId = null;
    } else if (escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS) {
      body.escalationHours = Math.floor(Number(escalationHours.trim()));
      body.escalationTargetMembershipId = escalationTargetMembershipId.trim();
    } else {
      body.escalationTargetMembershipId = escalationTargetMembershipId.trim();
    }

    setError(null);
    setSubmitting(true);
    try {
      const res = await apiFetch("/api/tenant/approval-routing-rules", {
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
              "Upgrade your plan to create this rule.",
          );
          return;
        }
        if (res.status === 409) {
          setError("A rule with this name already exists.");
          return;
        }
        setError(
          (data as { error?: { message?: string } }).error?.message ?? "Could not create rule.",
        );
        return;
      }
      toast.addToast("success", "Approval routing rule created.");
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
      onClose={() => !submitting && onClose()}
      title="Create approval routing rule"
      closeDisabled={submitting}
      contentClassName="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        {loadingRefs ? (
          <div className="flex items-center gap-2 text-sm text-(--text-muted)">
            <Spinner size="sm" /> Loading…
          </div>
        ) : (
          <ApprovalRoutingRuleFormFields
            disabled={submitting}
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
            nameRequired
          />
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
