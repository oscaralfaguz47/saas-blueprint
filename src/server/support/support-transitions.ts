import "server-only";

import type { SupportTicketStatus } from "@prisma/client";

const NORMAL: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  OPEN: ["IN_PROGRESS", "WAITING_FOR_CUSTOMER", "CLOSED"],
  IN_PROGRESS: ["WAITING_FOR_CUSTOMER", "CLOSED"],
  WAITING_FOR_CUSTOMER: ["IN_PROGRESS", "CLOSED"],
  CLOSED: [],
};

/**
 * Allowed manual status transitions (excludes reopen — use dedicated reopen flow).
 */
export function isValidTicketTransition(
  from: SupportTicketStatus,
  to: SupportTicketStatus
): boolean {
  if (from === to) return true;
  return NORMAL[from]?.includes(to) ?? false;
}

/** CLOSED → OPEN only via explicit reopen endpoint. */
export function isValidReopenTransition(
  from: SupportTicketStatus,
  to: SupportTicketStatus
): boolean {
  return from === "CLOSED" && to === "OPEN";
}
