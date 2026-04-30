import { describe, expect, it } from "vitest";
import { LegacyFieldRemovedError } from "@/lib/validations/common";
import { rejectLegacyRecordFinanceKeys } from "@/lib/validations/record";

describe("rejectLegacyRecordFinanceKeys", () => {
  it("throws LegacyFieldRemovedError for top-level amount", () => {
    expect(() => rejectLegacyRecordFinanceKeys({ amount: 1 })).toThrow(LegacyFieldRemovedError);
  });

  it("throws LegacyFieldRemovedError for top-level currency", () => {
    expect(() => rejectLegacyRecordFinanceKeys({ currency: "USD" })).toThrow(LegacyFieldRemovedError);
  });

  it("does not throw for nested amount", () => {
    expect(() =>
      rejectLegacyRecordFinanceKeys({ nested: { amount: 1 } })
    ).not.toThrow();
  });

  it("no-ops for non-objects", () => {
    expect(() => rejectLegacyRecordFinanceKeys(null)).not.toThrow();
    expect(() => rejectLegacyRecordFinanceKeys(undefined)).not.toThrow();
    expect(() => rejectLegacyRecordFinanceKeys([])).not.toThrow();
  });
});
