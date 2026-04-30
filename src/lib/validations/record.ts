import { z } from "zod";
import { emailSchema, LegacyFieldRemovedError } from "./common";

const recordTypeEnum = z.enum(
  [
    "SCOPE_CHANGE",
    "DECISION",
    "BUDGET",
    "BUDGET_REQUEST",
    "SPEND_APPROVAL",
    "VENDOR_PAYMENT_REQUEST",
    "REIMBURSEMENT",
    "FINANCIAL_EXCEPTION",
    "CONTRACT_SCOPE_CHANGE",
    "FORECAST_ADJUSTMENT",
    "OTHER_FINANCIAL_REQUEST",
  ],
  { message: "Invalid record type" }
);

/**
 * Record creation schema — B1
 * requestedAmount: >= 0 (zero is valid, e.g. free approvals)
 * currencyCode: ISO 4217 — exactly 3 uppercase letters
 */
export const createRecordSchema = z
  .object({
    title: z.string().min(1, "Title is required").max(160).trim(),
    type: recordTypeEnum,
    description: z.string().max(5000).trim().optional(),
    clientName: z.string().max(120).trim().optional(),
    clientEmail: emailSchema.optional(),
    visibility: z.enum(["WORKSPACE", "RESTRICTED"]).default("WORKSPACE"),
    isSensitive: z.boolean().default(false),
    status: z.enum(["OPEN", "DRAFT"]).default("OPEN"),
    requestedAmount: z.number().min(0).optional(),
    currencyCode: z.string().regex(/^[A-Z]{3}$/).optional(),
    businessJustification: z.string().max(2000).trim().optional(),
    vendorName: z.string().max(160).trim().optional(),
    payeeName: z.string().max(160).trim().optional(),
    invoiceNumber: z.string().max(100).trim().optional(),
    contractReference: z.string().max(100).trim().optional(),
    purchaseOrderRef: z.string().max(100).trim().optional(),
    priority: z.enum(["LOW", "MEDIUM", "HIGH", "URGENT"]).default("MEDIUM"),
    costCenterId: z.string().cuid().optional(),
    departmentId: z.string().cuid().optional(),
    departmentName: z.string().max(120).trim().optional(),
    costCenterCode: z.string().max(60).trim().optional(),
    neededByDate: z.string().datetime().optional(),
    hasPolicyException: z.boolean().default(false),
    policyExceptionReason: z.string().max(1000).trim().optional(),
    isRecurring: z.boolean().default(false),
    recurrenceNotes: z.string().max(500).trim().optional(),
    amountIsEstimated: z.boolean().default(false),
    budgetImpactType: z
      .enum([
        "NEW_SPEND",
        "BUDGET_REALLOCATION",
        "OVER_BUDGET",
        "NO_BUDGET_IMPACT",
        "UNKNOWN",
      ])
      .optional(),
  })
  .refine(
    (data) => {
      if (data.hasPolicyException && !data.policyExceptionReason?.trim()) {
        return false;
      }
      return true;
    },
    {
      message: "Policy exception reason is required when policy exception is enabled.",
      path: ["policyExceptionReason"],
    }
  )
  .refine(
    (data) => {
      if (data.requestedAmount != null && !data.currencyCode) {
        return false;
      }
      return true;
    },
    {
      message: "Currency is required when an amount is specified.",
      path: ["currencyCode"],
    }
  );

export type CreateRecordInput = z.infer<typeof createRecordSchema>;

export function rejectLegacyRecordFinanceKeys(body: unknown): void {
  if (!body || typeof body !== "object" || Array.isArray(body)) return;
  const obj = body as Record<string, unknown>;
  if (Object.prototype.hasOwnProperty.call(obj, "amount")) {
    throw new LegacyFieldRemovedError(
      "amount",
      "Field 'amount' is no longer accepted. Use 'requestedAmount' instead."
    );
  }
  if (Object.prototype.hasOwnProperty.call(obj, "currency")) {
    throw new LegacyFieldRemovedError(
      "currency",
      "Field 'currency' is no longer accepted. Use 'currencyCode' instead."
    );
  }
}
