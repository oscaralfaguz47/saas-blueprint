import { FinanceStatus } from "@prisma/client";

type QueueBadgeVariant = "default" | "success" | "warning" | "destructive" | "secondary";

export function financeStatusLabel(status: FinanceStatus): string {
  const labels: Record<FinanceStatus, string> = {
    NOT_REQUIRED: "Not required",
    PENDING_ASSIGNMENT: "Pending assignment",
    ASSIGNED: "Assigned",
    IN_PROGRESS: "In progress",
    COMPLETED: "Completed",
    CANCELED: "Canceled",
    FAILED: "Failed",
  };
  return labels[status] ?? status;
}

export function financeStatusBadgeVariant(status: FinanceStatus): QueueBadgeVariant {
  switch (status) {
    case FinanceStatus.ASSIGNED:
      return "secondary";
    case FinanceStatus.IN_PROGRESS:
      return "warning";
    case FinanceStatus.COMPLETED:
      return "success";
    case FinanceStatus.CANCELED:
    case FinanceStatus.FAILED:
      return "destructive";
    case FinanceStatus.PENDING_ASSIGNMENT:
      return "warning";
    case FinanceStatus.NOT_REQUIRED:
    default:
      return "default";
  }
}

/** Comma-separated list for `status` query when "All statuses" is selected. */
export const ALL_FINANCE_STATUSES_QUERY = Object.values(FinanceStatus).join(",");
