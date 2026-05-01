import { z } from "zod";
import {
  ApprovalEscalationPolicy,
  ApprovalRoutingMode,
  ApprovalRoutingRuleStatus,
  ApproverTargetType,
  ConditionField,
  ConditionOperator,
  FinanceResponsibility,
  WorkspaceRole,
} from "@prisma/client";
import { validateConditionShape } from "./finance-assignment-rule";

/** Plan slice used for approval routing gates (mirrors `PlanFeatures.approvalRouting`). */
export type ApprovalRoutingPlanFeatures = {
  enabled: boolean;
  maxRules: number;
  allowSequential: boolean;
  allowEscalation: boolean;
  allowCustomField: boolean;
};

export type ApprovalRoutingPlanGateResult =
  | { ok: true }
  | { ok: false; reason: "not_enabled" }
  | { ok: false; reason: "limit_reached"; maxRules: number }
  | { ok: false; reason: "sequential" }
  | { ok: false; reason: "escalation" }
  | { ok: false; reason: "custom_field" };

/**
 * Plan gate evaluation for POST and PATCH (effective mode, escalation, condition fields).
 * Order: enabled → maxRules → SEQUENTIAL → escalation ≠ NONE → CUSTOM_FIELD in conditions.
 */
export function evaluateApprovalRoutingPlanGate(
  ar: ApprovalRoutingPlanFeatures,
  input: {
    currentRuleCount?: number;
    mode: ApprovalRoutingMode;
    escalationPolicy: ApprovalEscalationPolicy;
    conditionFields: ConditionField[];
  }
): ApprovalRoutingPlanGateResult {
  if (!ar.enabled) return { ok: false, reason: "not_enabled" };
  if (
    input.currentRuleCount !== undefined &&
    input.currentRuleCount >= ar.maxRules
  ) {
    return { ok: false, reason: "limit_reached", maxRules: ar.maxRules };
  }
  if (input.mode === ApprovalRoutingMode.SEQUENTIAL && !ar.allowSequential) {
    return { ok: false, reason: "sequential" };
  }
  if (
    input.escalationPolicy !== ApprovalEscalationPolicy.NONE &&
    !ar.allowEscalation
  ) {
    return { ok: false, reason: "escalation" };
  }
  if (
    input.conditionFields.some((f) => f === ConditionField.CUSTOM_FIELD) &&
    !ar.allowCustomField
  ) {
    return { ok: false, reason: "custom_field" };
  }
  return { ok: true };
}

const conditionSchema = z
  .object({
    field: z.nativeEnum(ConditionField),
    operator: z.nativeEnum(ConditionOperator),
    valueString: z.string().max(255).optional(),
    valueNumber: z.number().finite().optional(),
    valueJson: z.unknown().optional(),
    customFieldKey: z.string().max(120).optional(),
  })
  .superRefine((c, ctx) => {
    const err = validateConditionShape(c);
    if (err) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: err });
    }
  });

export const approvalRoutingRuleApproverSchema = z.discriminatedUnion("targetType", [
  z
    .object({
      targetType: z.literal(ApproverTargetType.SPECIFIC_USER),
      targetMembershipId: z.string().cuid(),
      sequenceOrder: z.number().int().min(1).default(1),
      requireAll: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      targetType: z.literal(ApproverTargetType.ROLE),
      targetWorkspaceRole: z.nativeEnum(WorkspaceRole),
      targetFinanceResponsibility: z.nativeEnum(FinanceResponsibility).optional(),
      sequenceOrder: z.number().int().min(1).default(1),
      requireAll: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      targetType: z.literal(ApproverTargetType.TEAM),
      targetTeamId: z.string().cuid(),
      sequenceOrder: z.number().int().min(1).default(1),
      requireAll: z.boolean().default(false),
    })
    .strict(),
  z
    .object({
      targetType: z.literal(ApproverTargetType.CREATOR_MANAGER),
      sequenceOrder: z.number().int().min(1).default(1),
      requireAll: z.boolean().default(false),
    })
    .strict(),
]);

const ruleScalarCreate = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(500).optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  mode: z.nativeEnum(ApprovalRoutingMode),
  status: z
    .nativeEnum(ApprovalRoutingRuleStatus)
    .default(ApprovalRoutingRuleStatus.ACTIVE),
  escalationPolicy: z
    .nativeEnum(ApprovalEscalationPolicy)
    .default(ApprovalEscalationPolicy.NONE),
  escalationHours: z.number().int().positive().optional().nullable(),
  escalationTargetMembershipId: z.string().cuid().optional().nullable(),
  triggerOnCreate: z.boolean().default(true),
  triggerOnAmountChange: z.boolean().default(false),
  conditions: z.array(conditionSchema).min(1).max(20),
  requiredApprovers: z.array(approvalRoutingRuleApproverSchema).min(1),
});

function refineEscalationAndSequential<T extends z.infer<typeof ruleScalarCreate>>(
  data: T,
  ctx: z.RefinementCtx
) {
  if (data.escalationPolicy === ApprovalEscalationPolicy.NONE) {
    if (data.escalationHours != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "escalationHours must be omitted when escalationPolicy is NONE",
        path: ["escalationHours"],
      });
    }
    if (data.escalationTargetMembershipId != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "escalationTargetMembershipId must be omitted when escalationPolicy is NONE",
        path: ["escalationTargetMembershipId"],
      });
    }
  }
  if (data.escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS) {
    if (data.escalationHours == null || data.escalationHours < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ESCALATE_AFTER_HOURS requires escalationHours",
        path: ["escalationHours"],
      });
    }
    if (!data.escalationTargetMembershipId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ESCALATE_AFTER_HOURS requires escalationTargetMembershipId",
        path: ["escalationTargetMembershipId"],
      });
    }
  }
  if (data.escalationPolicy === ApprovalEscalationPolicy.AUTO_DELEGATE) {
    if (!data.escalationTargetMembershipId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "AUTO_DELEGATE requires escalationTargetMembershipId",
        path: ["escalationTargetMembershipId"],
      });
    }
  }
  if (data.mode === ApprovalRoutingMode.SEQUENTIAL) {
    const orders = data.requiredApprovers.map((a) => a.sequenceOrder);
    if (new Set(orders).size !== orders.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEQUENTIAL mode requires unique sequenceOrder per approver",
        path: ["requiredApprovers"],
      });
    }
  }
}

export const approvalRoutingRuleCreateSchema = ruleScalarCreate.superRefine(
  (data, ctx) => refineEscalationAndSequential(data, ctx)
);

const ruleScalarPatch = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).optional(),
    priority: z.number().int().min(1).max(1000).optional(),
    mode: z.nativeEnum(ApprovalRoutingMode).optional(),
    status: z.nativeEnum(ApprovalRoutingRuleStatus).optional(),
    escalationPolicy: z.nativeEnum(ApprovalEscalationPolicy).optional(),
    escalationHours: z.number().int().positive().optional().nullable(),
    escalationTargetMembershipId: z.string().cuid().optional().nullable(),
    triggerOnCreate: z.boolean().optional(),
    triggerOnAmountChange: z.boolean().optional(),
    conditions: z.array(conditionSchema).max(20).optional(),
    requiredApprovers: z.array(approvalRoutingRuleApproverSchema).min(1).optional(),
  })
  .refine((d) => Object.keys(d).length > 0, {
    message: "At least one field must be provided",
  });

export const approvalRoutingRulePatchSchema = ruleScalarPatch.superRefine((data, ctx) => {
  const mode = data.mode;
  const approvers = data.requiredApprovers;
  if (
    mode === ApprovalRoutingMode.SEQUENTIAL &&
    approvers &&
    approvers.length > 0
  ) {
    const orders = approvers.map((a) => a.sequenceOrder);
    if (new Set(orders).size !== orders.length) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "SEQUENTIAL mode requires unique sequenceOrder per approver",
        path: ["requiredApprovers"],
      });
    }
  }
  if (
    data.escalationPolicy === ApprovalEscalationPolicy.NONE &&
    data.escalationHours != null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "escalationHours must be null when escalationPolicy is NONE",
      path: ["escalationHours"],
    });
  }
  if (
    data.escalationPolicy === ApprovalEscalationPolicy.NONE &&
    data.escalationTargetMembershipId != null
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message:
        "escalationTargetMembershipId must be null when escalationPolicy is NONE",
      path: ["escalationTargetMembershipId"],
    });
  }
  if (data.escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS) {
    if (data.escalationHours == null || data.escalationHours < 1) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "ESCALATE_AFTER_HOURS requires escalationHours in the same request",
        path: ["escalationHours"],
      });
    }
    if (!data.escalationTargetMembershipId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "ESCALATE_AFTER_HOURS requires escalationTargetMembershipId in the same request",
        path: ["escalationTargetMembershipId"],
      });
    }
  }
  if (data.escalationPolicy === ApprovalEscalationPolicy.AUTO_DELEGATE) {
    if (!data.escalationTargetMembershipId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message:
          "AUTO_DELEGATE requires escalationTargetMembershipId in the same request",
        path: ["escalationTargetMembershipId"],
      });
    }
  }
});

/** Validate escalation fields after PATCH body is merged with the existing rule (route handler). */
export function assertMergedEscalationConfig(params: {
  escalationPolicy: ApprovalEscalationPolicy;
  escalationHours: number | null | undefined;
  escalationTargetMembershipId: string | null | undefined;
}): string | null {
  if (params.escalationPolicy === ApprovalEscalationPolicy.NONE) {
    if (params.escalationHours != null) {
      return "escalationHours must be unset when escalationPolicy is NONE";
    }
    if (params.escalationTargetMembershipId != null) {
      return "escalationTargetMembershipId must be unset when escalationPolicy is NONE";
    }
    return null;
  }
  if (params.escalationPolicy === ApprovalEscalationPolicy.ESCALATE_AFTER_HOURS) {
    if (params.escalationHours == null || params.escalationHours < 1) {
      return "ESCALATE_AFTER_HOURS requires escalationHours";
    }
    if (!params.escalationTargetMembershipId) {
      return "ESCALATE_AFTER_HOURS requires escalationTargetMembershipId";
    }
    return null;
  }
  if (params.escalationPolicy === ApprovalEscalationPolicy.AUTO_DELEGATE) {
    if (!params.escalationTargetMembershipId) {
      return "AUTO_DELEGATE requires escalationTargetMembershipId";
    }
    return null;
  }
  return null;
}

export const approvalRoutingRuleListQuerySchema = z.object({
  limit: z.coerce.number().int().positive().max(50).default(20),
  cursor: z.string().optional(),
  status: z.nativeEnum(ApprovalRoutingRuleStatus).optional(),
  includeArchived: z
    .union([z.literal("true"), z.literal("false")])
    .optional()
    .transform((v) => v === "true"),
});

export type ApprovalRoutingRuleCreateInput = z.infer<
  typeof approvalRoutingRuleCreateSchema
>;
export type ApprovalRoutingRulePatchInput = z.infer<
  typeof approvalRoutingRulePatchSchema
>;
