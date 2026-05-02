import type { ConditionField, ConditionOperator } from "@prisma/client";
import {
  AssignmentRuleStatus,
  AssignmentStrategy,
  RecordType,
} from "@prisma/client";

export const STRATEGY_LABELS: Record<AssignmentStrategy, string> = {
  ROUND_ROBIN: "Round robin (weighted)",
  LEAST_LOADED: "Least loaded",
  ROUND_ROBIN_THEN_LEAST: "Round robin, then least loaded",
  SPECIFIC_MEMBER: "Specific member",
  TEAM_LEAD: "Team lead",
};

export const STATUS_LABELS: Record<AssignmentRuleStatus, string> = {
  ACTIVE: "Active",
  PAUSED: "Paused",
  ARCHIVED: "Archived",
};

export const FIELD_LABELS: Record<ConditionField, string> = {
  RECORD_TYPE: "Record type",
  REQUESTED_AMOUNT: "Requested amount",
  CURRENCY_CODE: "Currency",
  DEPARTMENT_ID: "Department",
  COST_CENTER_ID: "Cost center",
  CREATED_BY_USER_ID: "Created by (user)",
  CREATED_BY_DEPARTMENT_ID: "Created by department",
  TAG: "Tag",
  CUSTOM_FIELD: "Custom field",
};

export const OPERATOR_LABELS: Record<ConditionOperator, string> = {
  EQUALS: "equals",
  NOT_EQUALS: "does not equal",
  IN: "is one of",
  NOT_IN: "is not one of",
  GREATER_THAN: "greater than",
  LESS_THAN: "less than",
  GREATER_THAN_OR_EQUAL: "greater or equal",
  LESS_THAN_OR_EQUAL: "less or equal",
  BETWEEN: "between",
  IS_NULL: "is empty",
  IS_NOT_NULL: "is not empty",
  CONTAINS: "contains",
};

function recordTypeTitle(s: string): string {
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const RECORD_TYPE_LABELS = Object.fromEntries(
  Object.values(RecordType).map((v) => [v, recordTypeTitle(v)]),
) as Record<RecordType, string>;

export function recordTypeSelectOptions() {
  return Object.values(RecordType).map((v) => ({ value: v, label: RECORD_TYPE_LABELS[v] }));
}

/** Fields with engine support; stubbed fields excluded from UI. */
export const VISIBLE_CONDITION_FIELDS = [
  "RECORD_TYPE",
  "REQUESTED_AMOUNT",
  "CURRENCY_CODE",
  "DEPARTMENT_ID",
  "COST_CENTER_ID",
  "CREATED_BY_USER_ID",
] as const satisfies readonly ConditionField[];

const RT_OPS: ConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "IN",
  "NOT_IN",
  "IS_NULL",
  "IS_NOT_NULL",
];
const AMT_OPS: ConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "GREATER_THAN",
  "LESS_THAN",
  "GREATER_THAN_OR_EQUAL",
  "LESS_THAN_OR_EQUAL",
  "BETWEEN",
  "IN",
  "NOT_IN",
  "IS_NULL",
  "IS_NOT_NULL",
];
const CUR_OPS: ConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "CONTAINS",
  "IN",
  "NOT_IN",
  "IS_NULL",
  "IS_NOT_NULL",
];
const ID_OPS: ConditionOperator[] = [
  "EQUALS",
  "NOT_EQUALS",
  "IN",
  "NOT_IN",
  "IS_NULL",
  "IS_NOT_NULL",
];

/** Mirrors validateConditionShape in finance-assignment-rule.ts. */
export function operatorsForField(field: ConditionField): ConditionOperator[] {
  switch (field) {
    case "RECORD_TYPE":
      return [...RT_OPS];
    case "REQUESTED_AMOUNT":
      return [...AMT_OPS];
    case "CURRENCY_CODE":
      return [...CUR_OPS];
    case "DEPARTMENT_ID":
    case "COST_CENTER_ID":
    case "CREATED_BY_USER_ID":
      return [...ID_OPS];
    default:
      return [];
  }
}

export function defaultOperatorForField(field: ConditionField): ConditionOperator {
  return operatorsForField(field)[0] ?? "EQUALS";
}
