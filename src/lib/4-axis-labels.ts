import {
  BillingAccessLevel,
  FinancialAccessScope,
  FinanceResponsibility,
  WorkspaceRole,
} from "@prisma/client";

export const WORKSPACE_ROLE_LABELS: Record<WorkspaceRole, string> = {
  [WorkspaceRole.OWNER]: "Owner",
  [WorkspaceRole.ADMIN]: "Admin",
  [WorkspaceRole.MEMBER]: "Member",
};

export const WORKSPACE_ROLE_DESCRIPTIONS: Record<WorkspaceRole, string> = {
  [WorkspaceRole.OWNER]: "Full workspace control including billing.",
  [WorkspaceRole.ADMIN]: "Manage workspace settings and users (no billing ownership).",
  [WorkspaceRole.MEMBER]: "Standard member access scoped by financial settings.",
};

export const FINANCIAL_ACCESS_LABELS: Record<FinancialAccessScope, string> = {
  [FinancialAccessScope.ALL]: "All financial data",
  [FinancialAccessScope.DEPARTMENT]: "Department-scoped",
  [FinancialAccessScope.OWN_AND_PARTICIPATING]: "Own and participating only",
  [FinancialAccessScope.NONE]: "No financial access",
};

export const FINANCIAL_ACCESS_DESCRIPTIONS: Record<FinancialAccessScope, string> = {
  [FinancialAccessScope.ALL]: "Sees all financial records across the workspace.",
  [FinancialAccessScope.DEPARTMENT]:
    "Sees financial records assigned to their department(s).",
  [FinancialAccessScope.OWN_AND_PARTICIPATING]:
    "Sees only records they created or participate in.",
  [FinancialAccessScope.NONE]: "No access to financial records.",
};

export const FINANCE_RESPONSIBILITY_LABELS: Record<FinanceResponsibility, string> = {
  [FinanceResponsibility.PROCESS]: "Process",
  [FinanceResponsibility.APPROVE]: "Approve",
  [FinanceResponsibility.PROCESS_AND_APPROVE]: "Process and approve",
  [FinanceResponsibility.NONE]: "None",
};

export const FINANCE_RESPONSIBILITY_DESCRIPTIONS: Record<FinanceResponsibility, string> = {
  [FinanceResponsibility.PROCESS]: "Can process finance workflows (e.g. data entry, steps).",
  [FinanceResponsibility.APPROVE]: "Can approve finance-related requests.",
  [FinanceResponsibility.PROCESS_AND_APPROVE]:
    "Can both process steps and approve in finance workflows.",
  [FinanceResponsibility.NONE]: "No finance responsibility.",
};

export const BILLING_ACCESS_LABELS: Record<BillingAccessLevel, string> = {
  [BillingAccessLevel.MANAGE]: "Manage billing",
  [BillingAccessLevel.READ]: "View billing",
  [BillingAccessLevel.NONE]: "No billing access",
};

export const BILLING_ACCESS_DESCRIPTIONS: Record<BillingAccessLevel, string> = {
  [BillingAccessLevel.MANAGE]: "Can change subscription, payment methods, and invoices.",
  [BillingAccessLevel.READ]: "Can view billing and invoices but not change them.",
  [BillingAccessLevel.NONE]: "Cannot view or manage billing.",
};
