import { describe, expect, it } from "vitest";
import { Prisma } from "@prisma/client";
import type { FinanceAssignmentRuleCondition, Record } from "@prisma/client";
import { ConditionField, ConditionOperator, RecordType } from "@prisma/client";
import { evaluateCondition } from "@/server/services/finance-assignment-engine/evaluate-condition";

const CID_DEP = "cldept0000000000000001";
const CID_CC = "clcc000000000000000001";
const CID_USER = "clusr00000000000000001";

const RT_A = RecordType.VENDOR_PAYMENT_REQUEST;
const RT_B = RecordType.REIMBURSEMENT;

function cond(
  overrides: Partial<FinanceAssignmentRuleCondition> &
    Pick<FinanceAssignmentRuleCondition, "field" | "operator">
): FinanceAssignmentRuleCondition {
  const { field, operator, ...rest } = overrides;
  return {
    id: "cond1",
    tenantId: "t1",
    ruleId: "rule1",
    field,
    operator,
    valueString: null,
    valueNumber: null,
    valueJson: null,
    customFieldKey: null,
    createdAt: new Date(),
    deletedAt: null,
    ...rest,
  } as FinanceAssignmentRuleCondition;
}

function rec(partial: Partial<Record> & Pick<Record, "type" | "createdByUserId">): Record {
  return {
    id: "rec1",
    tenantId: "t1",
    title: "x",
    visibility: "RESTRICTED",
    isSensitive: false,
    status: "OPEN",
    submitCount: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    approvalStatus: "NOT_STARTED",
    overdue: false,
    amountIsEstimated: false,
    isRecurring: false,
    hasPolicyException: false,
    isOverBudget: false,
    missingRequiredEvidence: false,
    possibleDuplicate: false,
    requiresFinanceReview: false,
    financeStatus: "NOT_REQUIRED",
    ...partial,
  } as Record;
}

describe("evaluateCondition — defer / unsupported", () => {
  it("CUSTOM_FIELD always NO_CUSTOM_FIELD_STORE", () => {
    const c = cond({
      field: ConditionField.CUSTOM_FIELD,
      operator: ConditionOperator.EQUALS,
      customFieldKey: "k1",
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(false);
    expect(out.reason).toBe("NO_CUSTOM_FIELD_STORE");
    expect(out.expectedValue).toBe("k1");
  });

  it("TAG always NO_TAG_STORE", () => {
    const c = cond({
      field: ConditionField.TAG,
      operator: ConditionOperator.EQUALS,
      valueString: "urgent",
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(false);
    expect(out.reason).toBe("NO_TAG_STORE");
  });

  it("CREATED_BY_DEPARTMENT_ID always CREATED_BY_DEPARTMENT_NOT_IMPLEMENTED", () => {
    const c = cond({
      field: ConditionField.CREATED_BY_DEPARTMENT_ID,
      operator: ConditionOperator.EQUALS,
      valueString: CID_DEP,
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(false);
    expect(out.reason).toBe("CREATED_BY_DEPARTMENT_NOT_IMPLEMENTED");
  });

  it("REQUESTED_AMOUNT CONTAINS is UNSUPPORTED_OPERATOR_RUNTIME", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.CONTAINS,
      valueString: "x",
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(1),
    });
    expect(evaluateCondition(c, r).reason).toBe("UNSUPPORTED_OPERATOR_RUNTIME");
  });
});

describe("evaluateCondition — RECORD_TYPE", () => {
  it("IS_NULL → RECORD_TYPE_NEVER_NULL", () => {
    const c = cond({ field: ConditionField.RECORD_TYPE, operator: ConditionOperator.IS_NULL });
    const r = rec({ type: RT_A, createdByUserId: CID_USER });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(false);
    expect(out.reason).toBe("RECORD_TYPE_NEVER_NULL");
  });

  it("IS_NOT_NULL → passed", () => {
    const c = cond({ field: ConditionField.RECORD_TYPE, operator: ConditionOperator.IS_NOT_NULL });
    const r = rec({ type: RT_A, createdByUserId: CID_USER });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("EQUALS match", () => {
    const c = cond({
      field: ConditionField.RECORD_TYPE,
      operator: ConditionOperator.EQUALS,
      valueString: RT_A,
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("EQUALS mismatch", () => {
    const c = cond({
      field: ConditionField.RECORD_TYPE,
      operator: ConditionOperator.EQUALS,
      valueString: RT_A,
    });
    const r = rec({ type: RT_B, createdByUserId: CID_USER });
    expect(evaluateCondition(c, r).passed).toBe(false);
  });

  it("IN passes when type in list", () => {
    const c = cond({
      field: ConditionField.RECORD_TYPE,
      operator: ConditionOperator.IN,
      valueJson: [RT_A, RT_B],
    });
    const r = rec({ type: RT_B, createdByUserId: CID_USER });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("NOT_IN passes when type excluded", () => {
    const c = cond({
      field: ConditionField.RECORD_TYPE,
      operator: ConditionOperator.NOT_IN,
      valueJson: [RT_A],
    });
    const r = rec({ type: RT_B, createdByUserId: CID_USER });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });
});

describe("evaluateCondition — REQUESTED_AMOUNT", () => {
  it("EQUALS exact Decimal", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.EQUALS,
      valueNumber: new Prisma.Decimal("100.00"),
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal("100.00"),
    });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(true);
    expect(out.actualValue).toBe("100");
    expect(out.expectedValue).toBe("100");
  });

  it("EQUALS precision mismatch 100.001 vs 100.00", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.EQUALS,
      valueNumber: new Prisma.Decimal("100.00"),
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal("100.001"),
    });
    expect(evaluateCondition(c, r).passed).toBe(false);
  });

  it("GREATER_THAN", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.GREATER_THAN,
      valueNumber: new Prisma.Decimal(10),
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(20),
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("LESS_THAN", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.LESS_THAN,
      valueNumber: new Prisma.Decimal(100),
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(50),
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("GREATER_THAN_OR_EQUAL boundary", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.GREATER_THAN_OR_EQUAL,
      valueNumber: new Prisma.Decimal(100),
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(100),
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("LESS_THAN_OR_EQUAL boundary", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.LESS_THAN_OR_EQUAL,
      valueNumber: new Prisma.Decimal(100),
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(100),
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("NOT_IN for amounts", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.NOT_IN,
      valueJson: [1, 2, 3],
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(5),
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("BETWEEN inclusive", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.BETWEEN,
      valueJson: [10, 20],
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(15),
    });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(true);
    expect(out.expectedValue).toEqual(["10", "20"]);
  });

  it("BETWEEN normalizes reversed bounds", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.BETWEEN,
      valueJson: [20, 10],
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(15),
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("BETWEEN outside", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.BETWEEN,
      valueJson: [10, 20],
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(21),
    });
    expect(evaluateCondition(c, r).passed).toBe(false);
  });

  it("IN with Decimal array", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.IN,
      valueJson: [1, 2, 3],
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(2),
    });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(true);
    expect(out.expectedValue).toEqual(["1", "2", "3"]);
  });

  it("null amount + comparison → MISSING_RECORD_VALUE", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.GREATER_THAN,
      valueNumber: new Prisma.Decimal(1),
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER, requestedAmount: null });
    expect(evaluateCondition(c, r).passed).toBe(false);
    expect(evaluateCondition(c, r).reason).toBe("MISSING_RECORD_VALUE");
  });

  it("null amount + IS_NULL → passed", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.IS_NULL,
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER, requestedAmount: null });
    expect(evaluateCondition(c, r).passed).toBe(true);
    expect(evaluateCondition(c, r).actualValue).toBe(null);
  });

  it("amount set + IS_NOT_NULL → passed", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.IS_NOT_NULL,
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(1),
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });
});

describe("evaluateCondition — CURRENCY_CODE", () => {
  it("EQUALS case-sensitive match", () => {
    const c = cond({
      field: ConditionField.CURRENCY_CODE,
      operator: ConditionOperator.EQUALS,
      valueString: "USD",
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      currencyCode: "USD",
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("EQUALS case-sensitive mismatch usd vs USD", () => {
    const c = cond({
      field: ConditionField.CURRENCY_CODE,
      operator: ConditionOperator.EQUALS,
      valueString: "USD",
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      currencyCode: "usd",
    });
    expect(evaluateCondition(c, r).passed).toBe(false);
  });

  it("IN includes USD", () => {
    const c = cond({
      field: ConditionField.CURRENCY_CODE,
      operator: ConditionOperator.IN,
      valueJson: ["USD", "EUR"],
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      currencyCode: "USD",
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("CONTAINS case-insensitive", () => {
    const c = cond({
      field: ConditionField.CURRENCY_CODE,
      operator: ConditionOperator.CONTAINS,
      valueString: "us",
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      currencyCode: "USD",
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("IS_NULL on null currency", () => {
    const c = cond({
      field: ConditionField.CURRENCY_CODE,
      operator: ConditionOperator.IS_NULL,
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER, currencyCode: null });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });
});

describe("evaluateCondition — ID fields", () => {
  it("DEPARTMENT_ID EQUALS match", () => {
    const c = cond({
      field: ConditionField.DEPARTMENT_ID,
      operator: ConditionOperator.EQUALS,
      valueString: CID_DEP,
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      departmentId: CID_DEP,
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("DEPARTMENT_ID null + EQUALS → MISSING_RECORD_VALUE", () => {
    const c = cond({
      field: ConditionField.DEPARTMENT_ID,
      operator: ConditionOperator.EQUALS,
      valueString: CID_DEP,
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      departmentId: null,
    });
    const out = evaluateCondition(c, r);
    expect(out.passed).toBe(false);
    expect(out.reason).toBe("MISSING_RECORD_VALUE");
  });

  it("COST_CENTER_ID NOT_EQUALS", () => {
    const c = cond({
      field: ConditionField.COST_CENTER_ID,
      operator: ConditionOperator.NOT_EQUALS,
      valueString: CID_CC,
    });
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      costCenterId: "othercc0000000000001",
    });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });

  it("CREATED_BY_USER_ID IN", () => {
    const c = cond({
      field: ConditionField.CREATED_BY_USER_ID,
      operator: ConditionOperator.IN,
      valueJson: [CID_USER, "otheruser00000000001"],
    });
    const r = rec({ type: RT_A, createdByUserId: CID_USER });
    expect(evaluateCondition(c, r).passed).toBe(true);
  });
});

describe("evaluateCondition — edge", () => {
  it("does not mutate condition or record", () => {
    const c = cond({
      field: ConditionField.REQUESTED_AMOUNT,
      operator: ConditionOperator.IN,
      valueJson: [1, 2],
    });
    const jsonBefore = JSON.stringify(c.valueJson);
    const r = rec({
      type: RT_A,
      createdByUserId: CID_USER,
      requestedAmount: new Prisma.Decimal(1),
    });
    const amtBefore = r.requestedAmount?.toString();
    evaluateCondition(c, r);
    expect(JSON.stringify(c.valueJson)).toBe(jsonBefore);
    expect(r.requestedAmount?.toString()).toBe(amtBefore);
  });
});
