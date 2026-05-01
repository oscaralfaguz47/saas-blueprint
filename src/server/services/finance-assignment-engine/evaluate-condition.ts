import "server-only";

import { Prisma } from "@prisma/client";
import type {
  ConditionField,
  ConditionOperator,
  FinanceAssignmentRuleCondition,
  Record,
} from "@prisma/client";
import { RecordType } from "@prisma/client";

const RECORD_TYPES = new Set<string>(Object.values(RecordType));

export type ConditionEvaluationResult = {
  conditionId: string;
  field: ConditionField;
  operator: ConditionOperator;
  expectedValue: unknown;
  actualValue: unknown;
  passed: boolean;
  reason?: string;
};

function decString(d: Prisma.Decimal | null | undefined): string | null {
  if (d == null) return null;
  return d.toString();
}

function coerceToDecimal(value: unknown): Prisma.Decimal | null {
  if (value == null) return null;
  if (value instanceof Prisma.Decimal) return value;
  if (typeof value === "number" && Number.isFinite(value)) return new Prisma.Decimal(value);
  if (typeof value === "string" && value.trim() !== "") {
    try {
      return new Prisma.Decimal(value);
    } catch {
      return null;
    }
  }
  return null;
}

function conditionNumberDecimal(c: FinanceAssignmentRuleCondition): Prisma.Decimal | null {
  return coerceToDecimal(c.valueNumber);
}

function compareDecimal(a: Prisma.Decimal, b: Prisma.Decimal): number {
  return a.cmp(b);
}

function decimalArrayIncludes(arr: unknown[], target: Prisma.Decimal): boolean {
  return arr.some((x) => {
    const d = coerceToDecimal(x);
    return d != null && compareDecimal(d, target) === 0;
  });
}

/** Normalize valueJson numeric arrays to strings for snapshot fields. */
function serializeExpectedJsonForAmounts(json: unknown): unknown {
  if (!Array.isArray(json)) return json;
  return json.map((x) => {
    const d = coerceToDecimal(x);
    return d != null ? d.toString() : x;
  });
}

function tagExpectedSnapshot(c: FinanceAssignmentRuleCondition): unknown {
  if (c.valueString !== undefined && c.valueString !== null) return c.valueString;
  if (c.valueJson !== undefined && c.valueJson !== null) {
    return JSON.parse(JSON.stringify(c.valueJson)) as unknown;
  }
  return null;
}

function createdByDeptExpected(c: FinanceAssignmentRuleCondition): unknown {
  if (c.valueString !== undefined && c.valueString !== null) return c.valueString;
  if (c.valueJson !== undefined && c.valueJson !== null) {
    return serializeExpectedJsonForAmounts(c.valueJson);
  }
  return null;
}

/**
 * Pure evaluation of one persisted rule condition against a Record row.
 * No DB I/O; does not mutate inputs. Decimal snapshots use .toString() only.
 */
export function evaluateCondition(
  condition: FinanceAssignmentRuleCondition,
  record: Record
): ConditionEvaluationResult {
  const base = {
    conditionId: condition.id,
    field: condition.field,
    operator: condition.operator,
  };

  if (condition.field === "CUSTOM_FIELD") {
    return {
      ...base,
      expectedValue: condition.customFieldKey ?? null,
      actualValue: null,
      passed: false,
      reason: "NO_CUSTOM_FIELD_STORE",
    };
  }

  if (condition.field === "TAG") {
    return {
      ...base,
      expectedValue: tagExpectedSnapshot(condition),
      actualValue: null,
      passed: false,
      reason: "NO_TAG_STORE",
    };
  }

  if (condition.field === "CREATED_BY_DEPARTMENT_ID") {
    return {
      ...base,
      expectedValue: createdByDeptExpected(condition),
      actualValue: null,
      passed: false,
      reason: "CREATED_BY_DEPARTMENT_NOT_IMPLEMENTED",
    };
  }

  if (condition.field === "RECORD_TYPE") {
    if (condition.operator === "IS_NULL") {
      return {
        ...base,
        expectedValue: null,
        actualValue: record.type,
        passed: false,
        reason: "RECORD_TYPE_NEVER_NULL",
      };
    }
    if (condition.operator === "IS_NOT_NULL") {
      return {
        ...base,
        expectedValue: null,
        actualValue: record.type,
        passed: true,
      };
    }
    if (condition.operator === "CONTAINS") {
      return {
        ...base,
        expectedValue: condition.valueString ?? null,
        actualValue: record.type,
        passed: false,
        reason: "UNSUPPORTED_OPERATOR_RUNTIME",
      };
    }
    if (condition.operator === "EQUALS" || condition.operator === "NOT_EQUALS") {
      const exp = condition.valueString;
      if (!exp || !RECORD_TYPES.has(exp)) {
        return {
          ...base,
          expectedValue: exp ?? null,
          actualValue: record.type,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      const eq = record.type === exp;
      const passed = condition.operator === "EQUALS" ? eq : !eq;
      return { ...base, expectedValue: exp, actualValue: record.type, passed };
    }
    if (condition.operator === "IN" || condition.operator === "NOT_IN") {
      const arr = condition.valueJson;
      if (!Array.isArray(arr) || !arr.every((x) => typeof x === "string" && RECORD_TYPES.has(x))) {
        return {
          ...base,
          expectedValue: condition.valueJson,
          actualValue: record.type,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      const inSet = arr.includes(record.type);
      const passed = condition.operator === "IN" ? inSet : !inSet;
      return { ...base, expectedValue: arr, actualValue: record.type, passed };
    }
    return {
      ...base,
      expectedValue: null,
      actualValue: record.type,
      passed: false,
      reason: "UNSUPPORTED_OPERATOR_RUNTIME",
    };
  }

  if (condition.field === "REQUESTED_AMOUNT") {
    const actual = record.requestedAmount;
    const actualStr = decString(actual);

    if (condition.operator === "IS_NULL") {
      return {
        ...base,
        expectedValue: null,
        actualValue: actualStr,
        passed: actual == null,
      };
    }
    if (condition.operator === "IS_NOT_NULL") {
      return {
        ...base,
        expectedValue: null,
        actualValue: actualStr,
        passed: actual != null,
      };
    }

    if (condition.operator === "CONTAINS") {
      return {
        ...base,
        expectedValue: condition.valueString ?? null,
        actualValue: actualStr,
        passed: false,
        reason: "UNSUPPORTED_OPERATOR_RUNTIME",
      };
    }

    if (actual == null) {
      return {
        ...base,
        expectedValue: null,
        actualValue: null,
        passed: false,
        reason: "MISSING_RECORD_VALUE",
      };
    }

    if (condition.operator === "BETWEEN") {
      const j = condition.valueJson;
      if (!Array.isArray(j) || j.length !== 2) {
        return {
          ...base,
          expectedValue: condition.valueJson,
          actualValue: actualStr,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      const a = coerceToDecimal(j[0]);
      const b = coerceToDecimal(j[1]);
      if (!a || !b) {
        return {
          ...base,
          expectedValue: serializeExpectedJsonForAmounts(j),
          actualValue: actualStr,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      const low = compareDecimal(a, b) <= 0 ? a : b;
      const high = compareDecimal(a, b) <= 0 ? b : a;
      const geLow = compareDecimal(actual, low) >= 0;
      const leHigh = compareDecimal(actual, high) <= 0;
      const passed = geLow && leHigh;
      return {
        ...base,
        expectedValue: [low.toString(), high.toString()],
        actualValue: actualStr,
        passed,
      };
    }

    if (condition.operator === "IN" || condition.operator === "NOT_IN") {
      const j = condition.valueJson;
      if (!Array.isArray(j) || j.length === 0) {
        return {
          ...base,
          expectedValue: condition.valueJson,
          actualValue: actualStr,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      const inc = decimalArrayIncludes(j, actual);
      const passed = condition.operator === "IN" ? inc : !inc;
      return {
        ...base,
        expectedValue: serializeExpectedJsonForAmounts(j),
        actualValue: actualStr,
        passed,
      };
    }

    const exp = conditionNumberDecimal(condition);
    if (!exp) {
      return {
        ...base,
        expectedValue: decString(coerceToDecimal(condition.valueNumber)),
        actualValue: actualStr,
        passed: false,
        reason: "UNSUPPORTED_OPERATOR_RUNTIME",
      };
    }

    if (
      condition.operator === "EQUALS" ||
      condition.operator === "NOT_EQUALS" ||
      condition.operator === "GREATER_THAN" ||
      condition.operator === "LESS_THAN" ||
      condition.operator === "GREATER_THAN_OR_EQUAL" ||
      condition.operator === "LESS_THAN_OR_EQUAL"
    ) {
      let passed = false;
      const cmp = compareDecimal(actual, exp);
      switch (condition.operator) {
        case "EQUALS":
          passed = cmp === 0;
          break;
        case "NOT_EQUALS":
          passed = cmp !== 0;
          break;
        case "GREATER_THAN":
          passed = cmp > 0;
          break;
        case "LESS_THAN":
          passed = cmp < 0;
          break;
        case "GREATER_THAN_OR_EQUAL":
          passed = cmp >= 0;
          break;
        case "LESS_THAN_OR_EQUAL":
          passed = cmp <= 0;
          break;
      }
      return { ...base, expectedValue: exp.toString(), actualValue: actualStr, passed };
    }

    return {
      ...base,
      expectedValue: null,
      actualValue: actualStr,
      passed: false,
      reason: "UNSUPPORTED_OPERATOR_RUNTIME",
    };
  }

  if (condition.field === "CURRENCY_CODE") {
    const cur = record.currencyCode;

    if (condition.operator === "IS_NULL") {
      return { ...base, expectedValue: null, actualValue: cur ?? null, passed: cur == null };
    }
    if (condition.operator === "IS_NOT_NULL") {
      return { ...base, expectedValue: null, actualValue: cur ?? null, passed: cur != null };
    }

    if (condition.operator === "CONTAINS") {
      const needle = condition.valueString?.trim() ?? "";
      if (!needle) {
        return {
          ...base,
          expectedValue: condition.valueString ?? null,
          actualValue: cur ?? null,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      if (cur == null) {
        return {
          ...base,
          expectedValue: needle,
          actualValue: null,
          passed: false,
          reason: "MISSING_RECORD_VALUE",
        };
      }
      const passed = cur.toLowerCase().includes(needle.toLowerCase());
      return { ...base, expectedValue: needle, actualValue: cur, passed };
    }

    if (condition.operator === "IN" || condition.operator === "NOT_IN") {
      const j = condition.valueJson;
      if (!Array.isArray(j) || !j.every((x) => typeof x === "string" && x.length > 0)) {
        return {
          ...base,
          expectedValue: condition.valueJson,
          actualValue: cur ?? null,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      if (cur == null) {
        return { ...base, expectedValue: j, actualValue: null, passed: false, reason: "MISSING_RECORD_VALUE" };
      }
      const inArr = j.includes(cur);
      const passed = condition.operator === "IN" ? inArr : !inArr;
      return { ...base, expectedValue: j, actualValue: cur, passed };
    }

    if (condition.operator === "EQUALS" || condition.operator === "NOT_EQUALS") {
      const exp = condition.valueString?.trim() ?? "";
      if (!exp) {
        return {
          ...base,
          expectedValue: condition.valueString ?? null,
          actualValue: cur ?? null,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      if (cur == null) {
        return { ...base, expectedValue: exp, actualValue: null, passed: false, reason: "MISSING_RECORD_VALUE" };
      }
      const eq = cur === exp;
      const passed = condition.operator === "EQUALS" ? eq : !eq;
      return { ...base, expectedValue: exp, actualValue: cur, passed };
    }

    return {
      ...base,
      expectedValue: null,
      actualValue: cur ?? null,
      passed: false,
      reason: "UNSUPPORTED_OPERATOR_RUNTIME",
    };
  }

  if (
    condition.field === "DEPARTMENT_ID" ||
    condition.field === "COST_CENTER_ID" ||
    condition.field === "CREATED_BY_USER_ID"
  ) {
    const actualStr =
      condition.field === "DEPARTMENT_ID"
        ? record.departmentId
        : condition.field === "COST_CENTER_ID"
          ? record.costCenterId
          : record.createdByUserId;

    if (condition.operator === "IS_NULL") {
      return { ...base, expectedValue: null, actualValue: actualStr ?? null, passed: actualStr == null };
    }
    if (condition.operator === "IS_NOT_NULL") {
      return { ...base, expectedValue: null, actualValue: actualStr ?? null, passed: actualStr != null };
    }

    if (condition.operator === "CONTAINS") {
      return {
        ...base,
        expectedValue: null,
        actualValue: actualStr ?? null,
        passed: false,
        reason: "UNSUPPORTED_OPERATOR_RUNTIME",
      };
    }

    if (condition.operator === "IN" || condition.operator === "NOT_IN") {
      const j = condition.valueJson;
      if (!Array.isArray(j) || !j.every((x) => typeof x === "string")) {
        return {
          ...base,
          expectedValue: condition.valueJson,
          actualValue: actualStr ?? null,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      if (actualStr == null) {
        return {
          ...base,
          expectedValue: j,
          actualValue: null,
          passed: false,
          reason: "MISSING_RECORD_VALUE",
        };
      }
      const inArr = j.includes(actualStr);
      const passed = condition.operator === "IN" ? inArr : !inArr;
      return { ...base, expectedValue: j, actualValue: actualStr, passed };
    }

    if (condition.operator === "EQUALS" || condition.operator === "NOT_EQUALS") {
      const exp = condition.valueString?.trim() ?? "";
      if (!exp) {
        return {
          ...base,
          expectedValue: condition.valueString ?? null,
          actualValue: actualStr ?? null,
          passed: false,
          reason: "UNSUPPORTED_OPERATOR_RUNTIME",
        };
      }
      if (actualStr == null) {
        return {
          ...base,
          expectedValue: exp,
          actualValue: null,
          passed: false,
          reason: "MISSING_RECORD_VALUE",
        };
      }
      const eq = actualStr === exp;
      const passed = condition.operator === "EQUALS" ? eq : !eq;
      return { ...base, expectedValue: exp, actualValue: actualStr, passed };
    }

    return {
      ...base,
      expectedValue: null,
      actualValue: actualStr ?? null,
      passed: false,
      reason: "UNSUPPORTED_OPERATOR_RUNTIME",
    };
  }

  return {
    ...base,
    expectedValue: null,
    actualValue: null,
    passed: false,
    reason: "UNSUPPORTED_OPERATOR_RUNTIME",
  };
}
