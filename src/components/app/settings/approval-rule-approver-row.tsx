"use client";

import type { ReactNode } from "react";
import type { ApprovalRoutingMode } from "@prisma/client";
import {
  ApproverTargetType,
  type FinanceResponsibility,
  type WorkspaceRole,
} from "@prisma/client";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  APPROVER_TARGET_SELECT_LABELS,
  CREATOR_MANAGER_ROW_LABEL,
  FINANCE_RESPONSIBILITY_LABELS,
  WORKSPACE_ROLE_LABELS,
} from "@/lib/approval-routing-rule-labels";

export type ApproverRowDraft = {
  clientId: string;
  targetType: ApproverTargetType;
  targetMembershipId: string;
  targetWorkspaceRole: WorkspaceRole;
  /** Empty string = any / omit optional enum on save */
  targetFinanceResponsibility: FinanceResponsibility | "";
  targetTeamId: string;
};

const SELECTABLE_TYPES = [
  ApproverTargetType.SPECIFIC_USER,
  ApproverTargetType.ROLE,
  ApproverTargetType.TEAM,
] as const;

type Props = {
  row: ApproverRowDraft;
  mode: ApprovalRoutingMode;
  stepIndex: number;
  membershipOptions: { value: string; label: string }[];
  teamOptions: { value: string; label: string }[];
  onChange: (next: ApproverRowDraft) => void;
  onRemove: () => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  disabled?: boolean;
};

export function ApprovalRuleApproverRow({
  row,
  mode,
  stepIndex,
  membershipOptions,
  teamOptions,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  disabled,
}: Props) {
  const typeOpts = SELECTABLE_TYPES.map((t) => ({
    value: t,
    label: APPROVER_TARGET_SELECT_LABELS[t] ?? t,
  }));
  const memOpts = [{ value: "", label: "Select member…" }, ...membershipOptions];
  const teamSelOpts = [{ value: "", label: "Select team…" }, ...teamOptions];
  const roleOpts = (Object.keys(WORKSPACE_ROLE_LABELS) as WorkspaceRole[]).map((r) => ({
    value: r,
    label: WORKSPACE_ROLE_LABELS[r],
  }));
  const finOpts = [
    { value: "", label: "Any responsibility" },
    ...(Object.keys(FINANCE_RESPONSIBILITY_LABELS) as FinanceResponsibility[]).map((f) => ({
      value: f,
      label: FINANCE_RESPONSIBILITY_LABELS[f],
    })),
  ];

  const setType = (t: ApproverTargetType | "") => {
    if (!t) return;
    onChange({
      ...row,
      targetType: t,
      targetMembershipId: "",
      targetWorkspaceRole: "MEMBER",
      targetFinanceResponsibility: "",
      targetTeamId: "",
    });
  };

  let targetFields: ReactNode = null;
  if (row.targetType === ApproverTargetType.CREATOR_MANAGER) {
    targetFields = (
      <p className="mt-1.5 text-sm text-(--text-secondary)">{CREATOR_MANAGER_ROW_LABEL}</p>
    );
  } else if (row.targetType === ApproverTargetType.SPECIFIC_USER) {
    targetFields = (
      <div className="mt-1.5">
        <SearchableSelect
          options={memOpts}
          value={row.targetMembershipId}
          onChange={(v) => onChange({ ...row, targetMembershipId: v })}
          disabled={disabled}
          placeholder="Search members…"
          aria-label="Approver membership"
        />
      </div>
    );
  } else if (row.targetType === ApproverTargetType.ROLE) {
    targetFields = (
      <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
        <select
          value={row.targetWorkspaceRole}
          onChange={(e) =>
            onChange({ ...row, targetWorkspaceRole: e.target.value as WorkspaceRole })
          }
          disabled={disabled}
          className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
        >
          {roleOpts.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select
          value={row.targetFinanceResponsibility}
          onChange={(e) =>
            onChange({
              ...row,
              targetFinanceResponsibility:
                e.target.value === "" ? "" : (e.target.value as FinanceResponsibility),
            })
          }
          disabled={disabled}
          className="w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
        >
          {finOpts.map((o) => (
            <option key={o.value === "" ? "_any" : o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
    );
  } else if (row.targetType === ApproverTargetType.TEAM) {
    targetFields = (
      <div className="mt-1.5">
        <SearchableSelect
          options={teamSelOpts}
          value={row.targetTeamId}
          onChange={(v) => onChange({ ...row, targetTeamId: v })}
          disabled={disabled}
          placeholder="Search teams…"
          aria-label="Approver finance team"
        />
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0 flex-1 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            {mode === "SEQUENTIAL" ? (
              <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full bg-(--bg-surface-elev) text-xs font-semibold text-(--text-primary)">
                {stepIndex + 1}
              </span>
            ) : null}
            {row.targetType !== ApproverTargetType.CREATOR_MANAGER ? (
              <select
                value={row.targetType}
                onChange={(e) => setType(e.target.value as ApproverTargetType)}
                disabled={disabled}
                className="max-w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-2 py-1.5 text-sm"
              >
                {typeOpts.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            ) : null}
          </div>
          {targetFields}
        </div>
        <div className="flex shrink-0 flex-col gap-1 sm:flex-row sm:items-center">
          {mode === "SEQUENTIAL" && row.targetType !== ApproverTargetType.CREATOR_MANAGER ? (
            <div className="flex gap-0.5">
              <button
                type="button"
                disabled={disabled || !onMoveUp}
                onClick={onMoveUp}
                className="rounded border border-(--border-subtle) px-2 py-1 text-xs disabled:opacity-40"
                aria-label="Move up"
              >
                ↑
              </button>
              <button
                type="button"
                disabled={disabled || !onMoveDown}
                onClick={onMoveDown}
                className="rounded border border-(--border-subtle) px-2 py-1 text-xs disabled:opacity-40"
                aria-label="Move down"
              >
                ↓
              </button>
            </div>
          ) : null}
          <button
            type="button"
            onClick={onRemove}
            disabled={disabled}
            className="rounded px-2 py-1 text-sm text-(--color-danger) hover:bg-(--bg-surface-elev) disabled:opacity-50"
          >
            Remove
          </button>
        </div>
      </div>
    </div>
  );
}

export function newApproverDraft(): ApproverRowDraft {
  return {
    clientId: crypto.randomUUID(),
    targetType: ApproverTargetType.SPECIFIC_USER,
    targetMembershipId: "",
    targetWorkspaceRole: "MEMBER",
    targetFinanceResponsibility: "",
    targetTeamId: "",
  };
}

/** Every approver includes requireAll: true (hidden in UI; Zod default is false). */
export function serializeRequiredApprovers(
  mode: ApprovalRoutingMode,
  rows: ApproverRowDraft[],
): Array<
  | {
      targetType: typeof ApproverTargetType.SPECIFIC_USER;
      targetMembershipId: string;
      sequenceOrder: number;
      requireAll: true;
    }
  | {
      targetType: typeof ApproverTargetType.ROLE;
      targetWorkspaceRole: WorkspaceRole;
      targetFinanceResponsibility?: FinanceResponsibility;
      sequenceOrder: number;
      requireAll: true;
    }
  | {
      targetType: typeof ApproverTargetType.TEAM;
      targetTeamId: string;
      sequenceOrder: number;
      requireAll: true;
    }
  | {
      targetType: typeof ApproverTargetType.CREATOR_MANAGER;
      sequenceOrder: number;
      requireAll: true;
    }
> {
  return rows.map((r, i) => {
    const sequenceOrder = mode === "SEQUENTIAL" ? i + 1 : 1;
    const base = { sequenceOrder, requireAll: true as const };
    if (r.targetType === ApproverTargetType.SPECIFIC_USER) {
      return {
        ...base,
        targetType: ApproverTargetType.SPECIFIC_USER,
        targetMembershipId: r.targetMembershipId,
      };
    }
    if (r.targetType === ApproverTargetType.ROLE) {
      const out: {
        targetType: typeof ApproverTargetType.ROLE;
        targetWorkspaceRole: WorkspaceRole;
        targetFinanceResponsibility?: FinanceResponsibility;
        sequenceOrder: number;
        requireAll: true;
      } = {
        ...base,
        targetType: ApproverTargetType.ROLE,
        targetWorkspaceRole: r.targetWorkspaceRole,
      };
      if (r.targetFinanceResponsibility) {
        out.targetFinanceResponsibility = r.targetFinanceResponsibility;
      }
      return out;
    }
    if (r.targetType === ApproverTargetType.TEAM) {
      return {
        ...base,
        targetType: ApproverTargetType.TEAM,
        targetTeamId: r.targetTeamId,
      };
    }
    return { ...base, targetType: ApproverTargetType.CREATOR_MANAGER };
  });
}
