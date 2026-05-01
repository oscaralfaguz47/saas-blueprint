import "server-only";

import {
  NotificationType,
  NotificationCategory,
  NotificationType as T,
  NotificationCategory as C,
} from "@prisma/client";

export type { NotificationType, NotificationCategory } from "@prisma/client";

export type NotificationChannelKey = "IN_APP" | "EMAIL";

/** Deterministic: every `NotificationType` maps to a category. */
export const TYPE_TO_CATEGORY: { [K in T]: C } = {
  [T.SUPPORT_TICKET_REPLY]: C.SOCIAL,
  [T.SUPPORT_TICKET_USER_REPLIED]: C.SOCIAL,
  [T.SUPPORT_TICKET_STATUS_CHANGED]: C.WORKFLOW,
  [T.SUPPORT_TICKET_ASSIGNED]: C.WORKFLOW,
  [T.RECORD_APPROVAL_FULLY_COMPLETED]: C.WORKFLOW,
  [T.RECORD_APPROVAL_REQUESTED]: C.WORKFLOW,
  [T.RECORD_FINANCE_ASSIGNED]: C.FINANCE,
  [T.RECORD_PAYMENT_STATUS_CHANGED]: C.FINANCE,
};

export function getCategoryForType(type: T): C {
  return TYPE_TO_CATEGORY[type];
}
