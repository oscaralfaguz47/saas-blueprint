import "server-only";

/**
 * Exponential backoff between retries (epic 05 §retries) — seconds before the next attempt.
 * Index = (attemptCount after a failed delivery) - 1, i.e. first failed try → delays[0].
 */
export const WEBHOOK_DELIVERY_BACKOFF_SECONDS = [
  60, 300, 900, 3600, 21600, 86400, 86400, 86400,
] as const;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export type AutoDisableReason =
  | "consecutive_failures_threshold"
  | "no_success_24h";

/**
 * After a failed *receiver* attempt, schedule the next delivery window.
 * `failedAttemptCount` = WebhookDelivery.attemptCount right after claim (the attempt that just ran and failed).
 */
export function nextRetryAtAfterFailedAttempt(
  failedAttemptCount: number,
  nowMs: number
): Date {
  const idx = Math.min(
    Math.max(failedAttemptCount - 1, 0),
    WEBHOOK_DELIVERY_BACKOFF_SECONDS.length - 1
  );
  const seconds = WEBHOOK_DELIVERY_BACKOFF_SECONDS[idx] ?? 86400;
  return new Date(nowMs + seconds * 1000);
}

const CONSECUTIVE_FAILURE_DISABLE_AT = 100;

/**
 * Returns whether the endpoint should move to DISABLED_AUTO after a receiver-side failure
 * (new consecutiveFailures is already applied in the same transaction as the read).
 */
export function shouldAutoDisableAfterReceiverFailure(
  consecutiveFailures: number,
  lastSuccessAt: Date | null,
  now: Date
): { disable: boolean; reason?: AutoDisableReason } {
  if (consecutiveFailures >= CONSECUTIVE_FAILURE_DISABLE_AT) {
    return { disable: true, reason: "consecutive_failures_threshold" };
  }
  if (consecutiveFailures <= 0) {
    return { disable: false };
  }
  const threshold = new Date(now.getTime() - MS_PER_DAY);
  // Epic 05 §7: "time since last success exceeds 24 hours with continued failures" — applies only
  // after at least one successful delivery (`lastSuccessAt` set). Never-successful endpoints rely
  // solely on the consecutive-failure threshold.
  if (lastSuccessAt != null && lastSuccessAt < threshold) {
    return { disable: true, reason: "no_success_24h" };
  }
  return { disable: false };
}

export function truncateForStorage(
  s: string,
  max: number
): string {
  if (s.length <= max) return s;
  return s.slice(0, max);
}
