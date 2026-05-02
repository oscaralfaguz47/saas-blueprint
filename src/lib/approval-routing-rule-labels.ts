import type {
  ApprovalEscalationPolicy,
  ApprovalRoutingMode,
  ApprovalRoutingRuleStatus,
  ApproverTargetType,
  FinanceResponsibility,
  WorkspaceRole,
} from "@prisma/client";
import {
  FIELD_LABELS,
  OPERATOR_LABELS,
  RECORD_TYPE_LABELS,
  VISIBLE_CONDITION_FIELDS,
  defaultOperatorForField,
  operatorsForField,
  recordTypeSelectOptions,
} from "@/lib/assignment-rule-labels";

export const ROUTING_MODE_LABELS: Record<ApprovalRoutingMode, string> = {
  SEQUENTIAL: "Sequential (ordered steps)",
  PARALLEL: "Parallel",
};

export const ROUTING_STATUS_LABELS: Record<ApprovalRoutingRuleStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export const ESCALATION_POLICY_LABELS: Record<ApprovalEscalationPolicy, string> = {
  NONE: "None",
  ESCALATE_AFTER_HOURS: "Escalate after hours",
  AUTO_DELEGATE: "Auto-delegate",
};

/** Select options: SPECIFIC_USER, ROLE, TEAM only (no CREATOR_MANAGER). */
export const APPROVER_TARGET_SELECT_LABELS: Partial<Record<ApproverTargetType, string>> = {
  SPECIFIC_USER: "Specific member",
  ROLE: "Workspace role",
  TEAM: "Finance team",
};

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
};

export const FINANCE_RESPONSIBILITY_LABELS: Record<FinanceResponsibility, string> = {
  PROCESS: "Process",
  APPROVE: "Approve",
  PROCESS_AND_APPROVE: "Process and approve",
  NONE: "Any",
};

/** Display when an existing approver row is CREATOR_MANAGER (not creatable from UI). */
export const CREATOR_MANAGER_ROW_LABEL = "Creator's manager";

export {
  FIELD_LABELS,
  OPERATOR_LABELS,
  RECORD_TYPE_LABELS,
  VISIBLE_CONDITION_FIELDS,
  defaultOperatorForField,
  operatorsForField,
  recordTypeSelectOptions,
};
