"use client";

import type { ReactNode } from "react";
import type { ConditionField, ConditionOperator } from "@prisma/client";
import { Input } from "@/components/ui/input";
import { SearchableSelect } from "@/components/ui/searchable-select";

export type ConditionRowDraft = {
  clientId: string;
  field: ConditionField;
  operator: ConditionOperator;
  valueString?: string;
  valueNumber?: number;
  valueJson?: unknown;
  amountListComma?: string;
  currencyListComma?: string;
};

export type RuleConditionRowProps = {
  row: ConditionRowDraft;
  onChange: (next: ConditionRowDraft) => void;
  onRemove: () => void;
  departmentOptions: { value: string; label: string }[];
  costCenterOptions: { value: string; label: string }[];
  /** Options for CREATED_BY_USER_ID (user id values, matching Record.createdByUserId). */
  memberOptions: { value: string; label: string }[];
  visibleFields: readonly ConditionField[];
  fieldLabels: Record<ConditionField, string>;
  operatorLabels: Record<ConditionOperator, string>;
  operatorsForField: (field: ConditionField) => ConditionOperator[];
  defaultOperatorForField: (field: ConditionField) => ConditionOperator;
  recordTypeSelectOptions: { value: string; label: string }[];
  /** Labels for record type chips (IN/NOT_IN). */
  recordTypeLabels: Record<string, string>;
  disabled?: boolean;
};

function resetValues(partial: Partial<ConditionRowDraft> = {}): Pick<
  ConditionRowDraft,
  "valueString" | "valueNumber" | "valueJson" | "amountListComma" | "currencyListComma"
> {
  return {
    valueString: undefined,
    valueNumber: undefined,
    valueJson: undefined,
    amountListComma: undefined,
    currencyListComma: undefined,
    ...partial,
  };
}

function IdInNotInPicker({
  idArray,
  pool,
  disabled,
  onRemoveAt,
  onAdd,
  firstOptionText,
  ariaLabel,
}: {
  idArray: string[];
  pool: { value: string; label: string }[];
  disabled?: boolean;
  onRemoveAt: (idx: number) => void;
  onAdd: (id: string) => void;
  firstOptionText: string;
  ariaLabel: string;
}) {
  const pickOpts = pool.filter((d) => !idArray.includes(d.value));
  return (
    <div className="mt-1.5 space-y-2">
      <div className="flex flex-wrap gap-1">
        {idArray.map((id, idx) => (
          <span
            key={`${id}-${idx}`}
            className="inline-flex items-center gap-1 rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs"
          >
            {pool.find((d) => d.value === id)?.label ?? id.slice(0, 8)}
            <button
              type="button"
              disabled={disabled}
              onClick={() => onRemoveAt(idx)}
              className="text-(--color-danger) disabled:opacity-50"
              aria-label="Remove"
            >
              ×
            </button>
          </span>
        ))}
      </div>
      <select
        value=""
        onChange={(e) => {
          const v = e.target.value;
          if (v) onAdd(v);
          e.target.value = "";
        }}
        disabled={disabled}
        className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
        aria-label={ariaLabel}
      >
        <option value="">{firstOptionText}</option>
        {pickOpts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

export function RuleConditionRow({
  row,
  onChange,
  onRemove,
  departmentOptions,
  costCenterOptions,
  memberOptions,
  visibleFields,
  fieldLabels,
  operatorLabels,
  operatorsForField,
  defaultOperatorForField,
  recordTypeSelectOptions,
  recordTypeLabels,
  disabled,
}: RuleConditionRowProps) {
  const fieldOptions = visibleFields.map((f) => ({
    value: f,
    label: fieldLabels[f],
  }));
  const opOptions = operatorsForField(row.field).map((o) => ({
    value: o,
    label: operatorLabels[o],
  }));
  const recordOpts = recordTypeSelectOptions;
  const idArray = Array.isArray(row.valueJson)
    ? (row.valueJson as string[]).filter((x) => typeof x === "string")
    : [];

  const setField = (field: ConditionField) => {
    onChange({
      ...row,
      field,
      operator: defaultOperatorForField(field),
      ...resetValues(),
    });
  };

  const setOperator = (operator: ConditionOperator) => {
    onChange({ ...row, operator, ...resetValues() });
  };

  const addIdToMulti = (id: string) => {
    if (!id || idArray.includes(id)) return;
    onChange({ ...row, valueJson: [...idArray, id] });
  };

  const removeIdAt = (idx: number) => {
    const next = idArray.filter((_, i) => i !== idx);
    onChange({ ...row, valueJson: next.length ? next : undefined });
  };

  const addRecordType = (v: string) => {
    if (!v || idArray.includes(v)) return;
    onChange({ ...row, valueJson: [...idArray, v] });
  };

  const removeRecordAt = (idx: number) => {
    const next = idArray.filter((_, i) => i !== idx);
    onChange({ ...row, valueJson: next.length ? next : undefined });
  };

  let valueControls: ReactNode = null;

  if (row.operator === "IS_NULL" || row.operator === "IS_NOT_NULL") {
    valueControls = null;
  } else if (row.field === "RECORD_TYPE") {
    if (row.operator === "EQUALS" || row.operator === "NOT_EQUALS") {
      valueControls = (
        <select
          value={row.valueString ?? ""}
          onChange={(e) => onChange({ ...row, valueString: e.target.value || undefined })}
          disabled={disabled}
          className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
        >
          <option value="">Select type…</option>
          {recordOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      );
    } else if (row.operator === "IN" || row.operator === "NOT_IN") {
      const pickOpts = recordOpts.filter((o) => !idArray.includes(o.value));
      valueControls = (
        <div className="mt-1.5 space-y-2">
          <div className="flex flex-wrap gap-1">
            {idArray.map((id, idx) => (
              <span
                key={`${id}-${idx}`}
                className="inline-flex items-center gap-1 rounded-full bg-(--bg-surface-elev) px-2 py-0.5 text-xs"
              >
                {recordTypeLabels[id] ?? id}
                <button
                  type="button"
                  disabled={disabled}
                  onClick={() => removeRecordAt(idx)}
                  className="text-(--color-danger) disabled:opacity-50"
                  aria-label="Remove"
                >
                  ×
                </button>
              </span>
            ))}
          </div>
          <select
            value=""
            onChange={(e) => {
              if (e.target.value) addRecordType(e.target.value);
              e.target.value = "";
            }}
            disabled={disabled}
            className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
          >
            <option value="">Add record type…</option>
            {pickOpts.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      );
    }
  } else if (row.field === "REQUESTED_AMOUNT") {
    if (row.operator === "BETWEEN") {
      const pair = Array.isArray(row.valueJson) ? (row.valueJson as unknown[]) : [undefined, undefined];
      const a = typeof pair[0] === "number" ? pair[0] : "";
      const b = typeof pair[1] === "number" ? pair[1] : "";
      valueControls = (
        <div className="mt-1.5 flex gap-2">
          <Input
            type="number"
            placeholder="Min"
            value={a === "" ? "" : String(a)}
            disabled={disabled}
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value);
              const q = Array.isArray(row.valueJson) ? [...(row.valueJson as unknown[])] : [undefined, undefined];
              q[0] = Number.isFinite(n) ? n : undefined;
              onChange({ ...row, valueJson: q });
            }}
          />
          <Input
            type="number"
            placeholder="Max"
            value={b === "" ? "" : String(b)}
            disabled={disabled}
            onChange={(e) => {
              const n = e.target.value === "" ? undefined : Number(e.target.value);
              const q = Array.isArray(row.valueJson) ? [...(row.valueJson as unknown[])] : [undefined, undefined];
              q[1] = Number.isFinite(n) ? n : undefined;
              onChange({ ...row, valueJson: q });
            }}
          />
        </div>
      );
    } else if (row.operator === "IN" || row.operator === "NOT_IN") {
      valueControls = (
        <Input
          placeholder="e.g. 100, 200, 300"
          value={row.amountListComma ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...row, amountListComma: e.target.value })}
          className="mt-1.5"
        />
      );
    } else {
      valueControls = (
        <Input
          type="number"
          value={row.valueNumber === undefined ? "" : String(row.valueNumber)}
          disabled={disabled}
          onChange={(e) => {
            const v = e.target.value;
            onChange({
              ...row,
              valueNumber: v === "" ? undefined : Number(v),
            });
          }}
          className="mt-1.5"
        />
      );
    }
  } else if (row.field === "CURRENCY_CODE") {
    if (row.operator === "IN" || row.operator === "NOT_IN") {
      valueControls = (
        <Input
          placeholder="USD, EUR (comma-separated)"
          value={row.currencyListComma ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...row, currencyListComma: e.target.value })}
          className="mt-1.5"
        />
      );
    } else {
      valueControls = (
        <Input
          placeholder="3-letter ISO"
          value={row.valueString ?? ""}
          disabled={disabled}
          onChange={(e) => onChange({ ...row, valueString: e.target.value || undefined })}
          className="mt-1.5"
          maxLength={8}
        />
      );
    }
  } else if (row.field === "DEPARTMENT_ID") {
    const opts = [{ value: "", label: "Select…" }, ...departmentOptions];
    if (row.operator === "EQUALS" || row.operator === "NOT_EQUALS") {
      valueControls = (
        <div className="mt-1.5">
          <SearchableSelect
            options={opts}
            value={row.valueString ?? ""}
            onChange={(v) => onChange({ ...row, valueString: v || undefined })}
            disabled={disabled}
            placeholder="Department"
            aria-label="Department"
          />
        </div>
      );
    } else if (row.operator === "IN" || row.operator === "NOT_IN") {
      valueControls = (
        <IdInNotInPicker
          idArray={idArray}
          pool={departmentOptions}
          disabled={disabled}
          onRemoveAt={removeIdAt}
          onAdd={addIdToMulti}
          firstOptionText="Add department…"
          ariaLabel="Add department to list"
        />
      );
    }
  } else if (row.field === "COST_CENTER_ID") {
    const opts = [{ value: "", label: "Select…" }, ...costCenterOptions];
    if (row.operator === "EQUALS" || row.operator === "NOT_EQUALS") {
      valueControls = (
        <div className="mt-1.5">
          <SearchableSelect
            options={opts}
            value={row.valueString ?? ""}
            onChange={(v) => onChange({ ...row, valueString: v || undefined })}
            disabled={disabled}
            placeholder="Cost center"
            aria-label="Cost center"
          />
        </div>
      );
    } else if (row.operator === "IN" || row.operator === "NOT_IN") {
      valueControls = (
        <IdInNotInPicker
          idArray={idArray}
          pool={costCenterOptions}
          disabled={disabled}
          onRemoveAt={removeIdAt}
          onAdd={addIdToMulti}
          firstOptionText="Add cost center…"
          ariaLabel="Add cost center to list"
        />
      );
    }
  } else if (row.field === "CREATED_BY_USER_ID") {
    const opts = [{ value: "", label: "Select…" }, ...memberOptions];
    if (row.operator === "EQUALS" || row.operator === "NOT_EQUALS") {
      valueControls = (
        <div className="mt-1.5">
          <SearchableSelect
            options={opts}
            value={row.valueString ?? ""}
            onChange={(v) => onChange({ ...row, valueString: v || undefined })}
            disabled={disabled}
            placeholder="Member"
            aria-label="Member"
          />
        </div>
      );
    } else if (row.operator === "IN" || row.operator === "NOT_IN") {
      valueControls = (
        <IdInNotInPicker
          idArray={idArray}
          pool={memberOptions}
          disabled={disabled}
          onRemoveAt={removeIdAt}
          onAdd={addIdToMulti}
          firstOptionText="Add user…"
          ariaLabel="Add user to list"
        />
      );
    }
  }

  return (
    <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[140px] flex-1">
          <span className="text-xs font-medium text-(--text-muted)">Field</span>
          <select
            value={row.field}
            onChange={(e) => setField(e.target.value as ConditionField)}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-2 py-1.5 text-sm"
          >
            {fieldOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[160px] flex-1">
          <span className="text-xs font-medium text-(--text-muted)">Operator</span>
          <select
            value={row.operator}
            onChange={(e) => setOperator(e.target.value as ConditionOperator)}
            disabled={disabled}
            className="mt-1 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-2 py-1.5 text-sm"
          >
            {opOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[200px] flex-[2]">{valueControls}</div>
        <button
          type="button"
          onClick={onRemove}
          disabled={disabled}
          className="mb-0.5 shrink-0 rounded px-2 py-1 text-sm text-(--color-danger) hover:bg-(--bg-surface-elev) disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    </div>
  );
}
