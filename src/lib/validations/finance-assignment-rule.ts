import { z } from "zod";
import {
  AssignmentRuleStatus,
  AssignmentStrategy,
  ConditionField,
  ConditionOperator,
  RecordType,
} from "@prisma/client";

const RECORD_TYPES = new Set<string>(Object.values(RecordType));

function isCuid(s: string): boolean {
  return z.string().cuid().safeParse(s).success;
}

/**
 * Matrix: which value slot is required for field + operator (doc 03 / C6).
 * - IN/NOT_IN → valueJson: non-empty array; element type depends on field.
 * - BETWEEN → valueJson: two-element tuple (numbers for REQUESTED_AMOUNT).
 * - IS_NULL / IS_NOT_NULL → no value* or customFieldKey.
 * - REQUESTED_AMOUNT comparisons → valueNumber.
 * - Id-like fields EQUALS/NOT_EQUALS → valueString (single cuid).
 * - RECORD_TYPE IN → valueJson array of RecordType enum strings.
 */
export function validateConditionShape(c: {
  field: ConditionField;
  operator: ConditionOperator;
  valueString?: string | undefined;
  valueNumber?: number | undefined;
  valueJson?: unknown;
  customFieldKey?: string | undefined;
}): string | null {
  if (c.field === "CUSTOM_FIELD") {
    if (!c.customFieldKey?.trim()) return "CUSTOM_FIELD_REQUIRES_KEY";
  }

  if (c.operator === "IS_NULL" || c.operator === "IS_NOT_NULL") {
    if (
      c.valueString !== undefined ||
      c.valueNumber !== undefined ||
      c.valueJson !== undefined
    ) {
      return "NULL_OPERATOR_REJECTS_VALUE";
    }
    return null;
  }

  const numericOps: ConditionOperator[] = [
    "GREATER_THAN",
    "LESS_THAN",
    "GREATER_THAN_OR_EQUAL",
    "LESS_THAN_OR_EQUAL",
  ];

  if (c.field === "REQUESTED_AMOUNT") {
    if (c.operator === "BETWEEN") {
      if (!Array.isArray(c.valueJson) || c.valueJson.length !== 2) {
        return "BETWEEN_REQUIRES_TWO_VALUES_JSON";
      }
      const [a, b] = c.valueJson as unknown[];
      if (typeof a !== "number" || typeof b !== "number" || !Number.isFinite(a) || !Number.isFinite(b)) {
        return "BETWEEN_REQUIRES_NUMERIC_PAIR";
      }
      return null;
    }
    if (c.operator === "IN" || c.operator === "NOT_IN") {
      if (!Array.isArray(c.valueJson) || c.valueJson.length === 0) return "IN_OPERATOR_REQUIRES_ARRAY_JSON";
      if (!c.valueJson.every((x) => typeof x === "number" && Number.isFinite(x))) {
        return "IN_OPERATOR_REQUIRES_NUMERIC_ARRAY";
      }
      return null;
    }
    if (
      c.operator === "EQUALS" ||
      c.operator === "NOT_EQUALS" ||
      numericOps.includes(c.operator)
    ) {
      if (c.valueNumber === undefined || !Number.isFinite(c.valueNumber)) {
        return "NUMERIC_FIELD_REQUIRES_VALUE_NUMBER";
      }
      return null;
    }
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  if (c.operator === "IN" || c.operator === "NOT_IN") {
    if (!Array.isArray(c.valueJson) || c.valueJson.length === 0) return "IN_OPERATOR_REQUIRES_ARRAY_JSON";
    if (c.field === "RECORD_TYPE") {
      if (!c.valueJson.every((x) => typeof x === "string" && RECORD_TYPES.has(x))) {
        return "RECORD_TYPE_IN_REQUIRES_ENUM_ARRAY";
      }
      return null;
    }
    if (
      c.field === "DEPARTMENT_ID" ||
      c.field === "COST_CENTER_ID" ||
      c.field === "CREATED_BY_USER_ID" ||
      c.field === "CREATED_BY_DEPARTMENT_ID"
    ) {
      if (!c.valueJson.every((x) => typeof x === "string" && isCuid(x))) {
        return "ID_FIELD_IN_REQUIRES_CUID_ARRAY";
      }
      return null;
    }
    if (c.field === "CURRENCY_CODE" || c.field === "TAG") {
      if (!c.valueJson.every((x) => typeof x === "string" && x.length > 0)) {
        return "STRING_FIELD_IN_REQUIRES_NONEMPTY_STRING_ARRAY";
      }
      return null;
    }
    if (c.field === "CUSTOM_FIELD") {
      if (!c.valueJson.every((x) => typeof x === "string")) return "CUSTOM_FIELD_IN_REQUIRES_STRING_ARRAY";
      return null;
    }
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  if (c.operator === "BETWEEN") {
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  if (c.field === "RECORD_TYPE") {
    if (c.operator === "CONTAINS") return "UNSUPPORTED_FIELD_OPERATOR";
    if (c.operator === "EQUALS" || c.operator === "NOT_EQUALS") {
      if (!c.valueString || !RECORD_TYPES.has(c.valueString)) return "RECORD_TYPE_REQUIRES_ENUM_STRING";
      return null;
    }
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  if (c.field === "CURRENCY_CODE") {
    if (c.operator === "EQUALS" || c.operator === "NOT_EQUALS" || c.operator === "CONTAINS") {
      if (!c.valueString?.trim()) return "STRING_FIELD_REQUIRES_VALUE_STRING";
      return null;
    }
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  if (c.field === "TAG") {
    if (c.operator === "EQUALS" || c.operator === "NOT_EQUALS" || c.operator === "CONTAINS") {
      if (!c.valueString?.trim()) return "STRING_FIELD_REQUIRES_VALUE_STRING";
      return null;
    }
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  if (
    c.field === "DEPARTMENT_ID" ||
    c.field === "COST_CENTER_ID" ||
    c.field === "CREATED_BY_USER_ID" ||
    c.field === "CREATED_BY_DEPARTMENT_ID"
  ) {
    if (c.operator === "EQUALS" || c.operator === "NOT_EQUALS") {
      if (!c.valueString?.trim() || !isCuid(c.valueString)) return "ID_FIELD_REQUIRES_CUID_STRING";
      return null;
    }
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  if (c.field === "CUSTOM_FIELD") {
    if (c.operator === "EQUALS" || c.operator === "NOT_EQUALS") {
      if (c.valueString === undefined) return "STRING_FIELD_REQUIRES_VALUE_STRING";
      return null;
    }
    if (c.operator === "CONTAINS") {
      if (!c.valueString?.trim()) return "STRING_FIELD_REQUIRES_VALUE_STRING";
      return null;
    }
    return "UNSUPPORTED_FIELD_OPERATOR";
  }

  return "UNSUPPORTED_FIELD_OPERATOR";
}

const conditionSchema = z
  .object({
    field: z.nativeEnum(ConditionField),
    operator: z.nativeEnum(ConditionOperator),
    valueString: z.string().max(255).optional(),
    valueNumber: z.number().finite().optional(),
    /** Typed in validateConditionShape (arrays, tuples); never arbitrary unchecked JSON. */
    valueJson: z.unknown().optional(),
    customFieldKey: z.string().max(120).optional(),
  })
  .superRefine((c, ctx) => {
    const err = validateConditionShape(c);
    if (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
    }
  });

export const financeAssignmentRuleCreateSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    description: z.string().trim().max(500).optional(),
    priority: z.number().int().min(1).max(1000).default(100),
    teamId: z.string().cuid(),
    strategy: z.nativeEnum(AssignmentStrategy).default(AssignmentStrategy.ROUND_ROBIN),
    specificMembershipId: z.string().cuid().optional(),
    status: z.nativeEnum(AssignmentRuleStatus).default(AssignmentRuleStatus.ACTIVE),
    conditions: z.array(conditionSchema).max(20),
  })
  .refine(
    (data) =>
      data.strategy !== AssignmentStrategy.SPECIFIC_MEMBER || !!data.specificMembershipId,
    {
      message: "SPECIFIC_MEMBER strategy requires specificMembershipId",
      path: ["specificMembershipId"],
    }
  );

const ruleScalarPatch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    teamId: z.string().cuid().optional(),
    strategy: z.nativeEnum(AssignmentStrategy).optional(),
    specificMembershipId: z.string().cuid().nullable().optional(),
    status: z.nativeEnum(AssignmentRuleStatus).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, { message: "At least one field must be provided" });

/** Partial rule scalars only; SPECIFIC_MEMBER + membership validated in route after merge. */
export const financeAssignmentRulePatchSchema = ruleScalarPatch;

export const financeAssignmentRuleListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  status: z.nativeEnum(AssignmentRuleStatus).optional(),
  teamId: z.string().cuid().optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export type FinanceAssignmentRuleCreateInput = z.infer<typeof financeAssignmentRuleCreateSchema>;
export type FinanceAssignmentRulePatchInput = z.infer<typeof financeAssignmentRulePatchSchema>;
