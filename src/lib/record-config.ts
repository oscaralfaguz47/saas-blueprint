import "server-only";

/**
 * Central config for record category behavior (server re-export).
 * Used by Route Handlers for validation, required fields, and
 * evidence requirements.
 *
 * Client components: import `RECORD_CATEGORY_CONFIG` from
 * `@/lib/record-category-config` instead.
 */

export type { RecordCategoryConfig } from "./record-category-config";
export { RECORD_CATEGORY_CONFIG } from "./record-category-config";

/**
 * Valid status transitions — server enforces these.
 * Key = current status, Value = allowed next statuses.
 */
export const VALID_STATUS_TRANSITIONS: Record<string, string[]> = {
  DRAFT: ["OPEN", "CANCELED"],
  OPEN: ["PENDING_APPROVAL", "CANCELED", "CLOSED"],
  PENDING_APPROVAL: ["IN_REVIEW", "OPEN", "CANCELED"],
  IN_REVIEW: ["AWAITING_INFO", "APPROVED", "REJECTED"],
  AWAITING_INFO: ["PENDING_APPROVAL", "IN_REVIEW"],
  APPROVED: ["CLOSED"],
  REJECTED: ["CLOSED"],
  CANCELED: [],
  CLOSED: [],
  // Legacy statuses — keep transitions working
  NO_RESPONSE: ["CLOSED"],
};

/**
 * Check if a status transition is valid.
 */
export function isValidStatusTransition(
  currentStatus: string,
  newStatus: string
): boolean {
  const allowed = VALID_STATUS_TRANSITIONS[currentStatus] ?? [];
  return allowed.includes(newStatus);
}
