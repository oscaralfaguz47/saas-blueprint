"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  BillingAccessLevel,
  FinancialAccessScope,
  FinanceResponsibility,
  WorkspaceRole,
} from "@prisma/client";
import { Dialog } from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useApiFetch } from "@/hooks/use-api-fetch";
import { useToast } from "@/components/ui/toast";
import { StepUpModal } from "@/components/app/step-up-modal";
import {
  BILLING_ACCESS_LABELS,
  FINANCE_RESPONSIBILITY_LABELS,
  FINANCIAL_ACCESS_LABELS,
  WORKSPACE_ROLE_LABELS,
} from "@/lib/4-axis-labels";

/** Mirrors list row shape from workspace-members-tab (no circular import). */
export type MemberAccessRow = {
  userId: string;
  membershipId?: string;
  name: string | null;
  email: string | null;
  role: string;
  workspaceRole?: "OWNER" | "ADMIN" | "MEMBER";
  financialAccess?: "ALL" | "DEPARTMENT" | "OWN_AND_PARTICIPATING" | "NONE";
  financeResponsibility?: "PROCESS" | "APPROVE" | "PROCESS_AND_APPROVE" | "NONE";
  billingAccess?: "MANAGE" | "READ" | "NONE";
};

export type UpdatedMemberAccessFields = {
  membershipId: string;
  userId: string;
  workspaceRole: WorkspaceRole;
  financialAccess: FinancialAccessScope;
  financeResponsibility: FinanceResponsibility;
  billingAccess: BillingAccessLevel;
  role: string;
};

type LegacyRoleOption = { value: string; label: string; disabled: boolean };

type Props = {
  open: boolean;
  onClose: () => void;
  member: MemberAccessRow;
  permissions: Set<string>;
  hasTwoFactor: boolean;
  email: string | null;
  legacyRoleOptions: LegacyRoleOption[];
  onSuccess: (updated: UpdatedMemberAccessFields) => void;
};

type AccessBaseline = {
  workspaceRole: MemberAccessRow["workspaceRole"];
  financialAccess: MemberAccessRow["financialAccess"];
  financeResponsibility: MemberAccessRow["financeResponsibility"];
  billingAccess: MemberAccessRow["billingAccess"];
  role: string;
};

export function computeMemberAccessDiff(
  initial: AccessBaseline,
  form: AccessBaseline,
): Record<string, unknown> {
  const diff: Record<string, unknown> = {};
  if (form.workspaceRole !== initial.workspaceRole) diff.workspaceRole = form.workspaceRole;
  if (form.financialAccess !== initial.financialAccess) diff.financialAccess = form.financialAccess;
  if (form.financeResponsibility !== initial.financeResponsibility) {
    diff.financeResponsibility = form.financeResponsibility;
  }
  if (form.billingAccess !== initial.billingAccess) diff.billingAccess = form.billingAccess;
  if (form.role !== initial.role) diff.role = form.role;
  return diff;
}

function baselineFromMember(m: MemberAccessRow): AccessBaseline {
  return {
    workspaceRole: m.workspaceRole ?? "MEMBER",
    financialAccess: m.financialAccess ?? "NONE",
    financeResponsibility: m.financeResponsibility ?? "NONE",
    billingAccess: m.billingAccess ?? "NONE",
    role: m.role,
  };
}

export function EditMemberAccessModal({
  open,
  onClose,
  member,
  permissions,
  hasTwoFactor,
  email,
  legacyRoleOptions,
  onSuccess,
}: Props) {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const baselineRef = useRef<AccessBaseline | null>(null);

  const [workspaceRole, setWorkspaceRole] = useState<NonNullable<MemberAccessRow["workspaceRole"]>>(
    "MEMBER",
  );
  const [financialAccess, setFinancialAccess] = useState<
    NonNullable<MemberAccessRow["financialAccess"]>
  >("NONE");
  const [financeResponsibility, setFinanceResponsibility] = useState<
    NonNullable<MemberAccessRow["financeResponsibility"]>
  >("NONE");
  const [billingAccess, setBillingAccess] = useState<NonNullable<MemberAccessRow["billingAccess"]>>(
    "NONE",
  );
  const [role, setRole] = useState(member.role);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stepUpOpen, setStepUpOpen] = useState(false);
  const [pendingPatchBody, setPendingPatchBody] = useState<Record<string, unknown> | null>(null);

  const hasUsersManage = permissions.has("tenant.users.manage");
  const hasRolesManage = permissions.has("tenant.roles.manage");
  const axisDisabled = !hasUsersManage || submitting;
  const roleDisabled = !hasRolesManage || submitting;
  const noFieldsEditable = !hasUsersManage && !hasRolesManage;

  useEffect(() => {
    if (!open) return;
    const b = baselineFromMember(member);
    baselineRef.current = b;
    setWorkspaceRole(b.workspaceRole ?? "MEMBER");
    setFinancialAccess(b.financialAccess ?? "NONE");
    setFinanceResponsibility(b.financeResponsibility ?? "NONE");
    setBillingAccess(b.billingAccess ?? "NONE");
    setRole(b.role);
    setError(null);
  }, [
    open,
    member.userId,
    member.membershipId,
    member.role,
    member.workspaceRole,
    member.financialAccess,
    member.financeResponsibility,
    member.billingAccess,
  ]);

  const resetAndClose = () => {
    setPendingPatchBody(null);
    setStepUpOpen(false);
    setError(null);
    onClose();
  };

  const handleClose = () => {
    if (!submitting) resetAndClose();
  };

  const executePatch = useCallback(
    async (body: Record<string, unknown>) => {
      const mid = member.membershipId;
      if (!mid) {
        setError("Missing membership id.");
        return;
      }
      setSubmitting(true);
      setError(null);
      let steppedUp = false;
      try {
        const res = await apiFetch(`/api/settings/workspace/members/${mid}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          showToastOnError: false,
        });
        const data = (await res.json().catch(() => ({}))) as {
          data?: UpdatedMemberAccessFields;
          error?: { code?: string; message?: string; details?: { code?: string } };
        };

        if (res.ok && data.data) {
          toast.addToast("success", "Member access updated.");
          onSuccess(data.data);
          const b = baselineFromMember({
            ...member,
            membershipId: data.data.membershipId,
            role: data.data.role,
            workspaceRole: data.data.workspaceRole,
            financialAccess: data.data.financialAccess,
            financeResponsibility: data.data.financeResponsibility,
            billingAccess: data.data.billingAccess,
          });
          baselineRef.current = b;
          setWorkspaceRole(b.workspaceRole ?? "MEMBER");
          setFinancialAccess(b.financialAccess ?? "NONE");
          setFinanceResponsibility(b.financeResponsibility ?? "NONE");
          setBillingAccess(b.billingAccess ?? "NONE");
          setRole(b.role);
          setSubmitting(false);
          resetAndClose();
          return;
        }

        const detailCode = data.error?.details?.code;
        const errMsg = data.error?.message ?? "Something went wrong.";

        if (res.status === 403 && detailCode === "STEP_UP_REQUIRED") {
          setPendingPatchBody(body);
          setStepUpOpen(true);
          steppedUp = true;
          return;
        }

        if (res.status === 403 && detailCode === "MEMBER_ACCESS_HIERARCHY") {
          setError(errMsg);
          return;
        }

        if (res.status === 400) {
          setError(errMsg);
          return;
        }

        if (res.status === 403) {
          setError("You don't have permission to update this member's access.");
          return;
        }

        if (res.status === 404) {
          setError("This member no longer exists.");
          return;
        }

        if (res.status === 409) {
          setError(errMsg);
          return;
        }

        setError(errMsg);
      } catch {
        setError("Network error. Please try again.");
      } finally {
        if (!steppedUp) setSubmitting(false);
      }
    },
    [apiFetch, member, onSuccess, toast],
  );

  const handleStepUpSuccess = useCallback(async () => {
    setStepUpOpen(false);
    const body = pendingPatchBody;
    setPendingPatchBody(null);
    if (!body) return;
    await executePatch(body);
  }, [pendingPatchBody, executePatch]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const baseline = baselineRef.current;
    if (!baseline || noFieldsEditable) return;
    const form: AccessBaseline = {
      workspaceRole,
      financialAccess,
      financeResponsibility,
      billingAccess,
      role,
    };
    const diff = computeMemberAccessDiff(baseline, form);
    if (Object.keys(diff).length === 0) return;
    await executePatch(diff);
  };

  const baseline = baselineRef.current;
  const formBaseline: AccessBaseline = {
    workspaceRole,
    financialAccess,
    financeResponsibility,
    billingAccess,
    role,
  };
  const diffEmpty =
    !baseline || Object.keys(computeMemberAccessDiff(baseline, formBaseline)).length === 0;

  if (!open) return null;

  const missingId = !member.membershipId;

  return (
    <>
      <Dialog
        open={open}
        onClose={handleClose}
        title="Edit member access"
        description={
          member.name || member.email
            ? `${member.name ?? member.email}${member.email && member.name ? ` (${member.email})` : ""}`
            : "Update workspace role, financial scope, and billing access."
        }
        closeDisabled={submitting || stepUpOpen}
      >
        <form onSubmit={handleSubmit} className="space-y-4">
          {missingId ? (
            <div
              role="alert"
              className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)"
            >
              This row is missing a membership id. Refresh the page or contact support.
            </div>
          ) : null}

          {noFieldsEditable ? (
            <div
              role="alert"
              className="rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) p-3 text-sm text-(--text-secondary)"
            >
              You don&apos;t have permission to edit member access.
            </div>
          ) : null}

          <div>
            <label
              htmlFor="access-legacy-role"
              className="block text-sm font-medium text-(--text-primary)"
            >
              Workspace role (legacy)
            </label>
            <select
              id="access-legacy-role"
              value={role}
              onChange={(e) => setRole(e.target.value)}
              disabled={roleDisabled || missingId}
              className="mt-1.5 min-h-[44px] w-full min-w-[100px] cursor-pointer rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
            >
              {legacyRoleOptions.map((opt) => (
                <option key={opt.value} value={opt.value} disabled={opt.disabled}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-3 border-t border-(--border-subtle) pt-3">
            <p className="text-xs font-medium text-(--text-muted)">Access dimensions</p>

            <div>
              <label
                htmlFor="access-workspace-role"
                className="block text-sm font-medium text-(--text-primary)"
              >
                Workspace role (axis)
              </label>
              <select
                id="access-workspace-role"
                value={workspaceRole}
                onChange={(e) =>
                  setWorkspaceRole(e.target.value as NonNullable<MemberAccessRow["workspaceRole"]>)
                }
                disabled={axisDisabled || missingId}
                className="mt-1.5 min-h-[44px] w-full cursor-pointer rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
              >
                {(Object.values(WorkspaceRole) as WorkspaceRole[]).map((v) => (
                  <option key={v} value={v}>
                    {WORKSPACE_ROLE_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="access-financial"
                className="block text-sm font-medium text-(--text-primary)"
              >
                Financial access
              </label>
              <select
                id="access-financial"
                value={financialAccess}
                onChange={(e) =>
                  setFinancialAccess(
                    e.target.value as NonNullable<MemberAccessRow["financialAccess"]>,
                  )
                }
                disabled={axisDisabled || missingId}
                className="mt-1.5 min-h-[44px] w-full cursor-pointer rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
              >
                {(Object.values(FinancialAccessScope) as FinancialAccessScope[]).map((v) => (
                  <option key={v} value={v}>
                    {FINANCIAL_ACCESS_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="access-finance-resp"
                className="block text-sm font-medium text-(--text-primary)"
              >
                Finance responsibility
              </label>
              <select
                id="access-finance-resp"
                value={financeResponsibility}
                onChange={(e) =>
                  setFinanceResponsibility(
                    e.target.value as NonNullable<MemberAccessRow["financeResponsibility"]>,
                  )
                }
                disabled={axisDisabled || missingId}
                className="mt-1.5 min-h-[44px] w-full cursor-pointer rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
              >
                {(Object.values(FinanceResponsibility) as FinanceResponsibility[]).map((v) => (
                  <option key={v} value={v}>
                    {FINANCE_RESPONSIBILITY_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label
                htmlFor="access-billing"
                className="block text-sm font-medium text-(--text-primary)"
              >
                Billing access
              </label>
              <select
                id="access-billing"
                value={billingAccess}
                onChange={(e) =>
                  setBillingAccess(e.target.value as NonNullable<MemberAccessRow["billingAccess"]>)
                }
                disabled={axisDisabled || missingId}
                className="mt-1.5 min-h-[44px] w-full cursor-pointer rounded border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs text-(--text-primary) disabled:opacity-60"
              >
                {(Object.values(BillingAccessLevel) as BillingAccessLevel[]).map((v) => (
                  <option key={v} value={v}>
                    {BILLING_ACCESS_LABELS[v]}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error ? (
            <div
              role="alert"
              className="rounded-lg border border-(--color-danger) bg-(--bg-surface) p-3 text-sm text-(--text-primary)"
            >
              {error}
            </div>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="cursor-pointer rounded-lg border border-(--border-subtle) px-4 py-2 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-elev) disabled:cursor-not-allowed disabled:opacity-60"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting || diffEmpty || noFieldsEditable || missingId}
              className="inline-flex h-10 cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? (
                <span className="inline-flex items-center gap-2">
                  <Spinner size="sm" />
                  Saving…
                </span>
              ) : (
                "Save"
              )}
            </button>
          </div>
        </form>
      </Dialog>

      <StepUpModal
        open={stepUpOpen}
        onClose={() => {
          setStepUpOpen(false);
          setPendingPatchBody(null);
        }}
        onSuccess={() => void handleStepUpSuccess()}
        hasTwoFactor={hasTwoFactor}
        email={email}
        actionLabel="Update member access"
      />
    </>
  );
}
