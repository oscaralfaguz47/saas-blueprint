import type { FinanceStatus } from "@prisma/client";

/** Shape of each item from GET /api/finance/queue `select` payload. */
export type FinanceQueueRecord = {
  id: string;
  recordKey: string | null;
  title: string;
  type: string;
  status: string;
  financeStatus: FinanceStatus;
  financeAssignedAt: string | null;
  requestedAmount: unknown;
  currencyCode: string | null;
  departmentId: string | null;
  priority: string;
  approvalStatus: string;
};
