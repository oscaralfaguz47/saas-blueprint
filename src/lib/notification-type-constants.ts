/**
 * Client-safe re-export of NotificationType enum values.
 * Mirrors prisma schema; keep in sync.
 * (No runtime dependency on @prisma/client.)
 */
export const NotificationType = {
  SUPPORT_TICKET_REPLY: "SUPPORT_TICKET_REPLY",
  SUPPORT_TICKET_STATUS_CHANGED: "SUPPORT_TICKET_STATUS_CHANGED",
  SUPPORT_TICKET_USER_REPLIED: "SUPPORT_TICKET_USER_REPLIED",
  SUPPORT_TICKET_ASSIGNED: "SUPPORT_TICKET_ASSIGNED",
  RECORD_APPROVAL_FULLY_COMPLETED: "RECORD_APPROVAL_FULLY_COMPLETED",
  RECORD_FINANCE_ASSIGNED: "RECORD_FINANCE_ASSIGNED",
  RECORD_PAYMENT_STATUS_CHANGED: "RECORD_PAYMENT_STATUS_CHANGED",
} as const;

export type NotificationType = (typeof NotificationType)[keyof typeof NotificationType];
