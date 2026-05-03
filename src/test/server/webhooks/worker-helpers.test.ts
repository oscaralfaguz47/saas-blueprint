import { describe, expect, it } from "vitest";

import {
  nextRetryAtAfterFailedAttempt,
  shouldAutoDisableAfterReceiverFailure,
  truncateForStorage,
  WEBHOOK_DELIVERY_BACKOFF_SECONDS,
} from "@/server/webhooks/worker-helpers";

describe("WEBHOOK_DELIVERY_BACKOFF_SECONDS", () => {
  it("matches epic 05 delays (8 slots)", () => {
    expect(WEBHOOK_DELIVERY_BACKOFF_SECONDS).toEqual([
      60, 300, 900, 3600, 21600, 86400, 86400, 86400,
    ]);
  });
});

describe("nextRetryAtAfterFailedAttempt", () => {
  it("uses index attemptCount-1 for first failure", () => {
    const now = Date.UTC(2026, 0, 1, 0, 0, 0);
    const d = nextRetryAtAfterFailedAttempt(1, now);
    expect(d.getTime() - now).toBe(60_000);
  });

  it("clamps high indices to last delay bucket", () => {
    const now = 0;
    const d = nextRetryAtAfterFailedAttempt(99, now);
    expect(d.getTime()).toBe(86400_000);
  });
});

describe("shouldAutoDisableAfterReceiverFailure", () => {
  const now = new Date("2026-04-30T12:00:00.000Z");

  it("disables at 100 consecutive failures", () => {
    expect(
      shouldAutoDisableAfterReceiverFailure(100, now, now)
    ).toEqual({ disable: true, reason: "consecutive_failures_threshold" });
  });

  it("disables when last success >24h ago and failures continue", () => {
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(
      shouldAutoDisableAfterReceiverFailure(3, old, now)
    ).toEqual({ disable: true, reason: "no_success_24h" });
  });

  it("does not disable when last success is recent", () => {
    const recent = new Date(now.getTime() - 60 * 60 * 1000);
    expect(shouldAutoDisableAfterReceiverFailure(5, recent, now)).toEqual({
      disable: false,
    });
  });

  it("does not disable at 99 failures if last success was recent", () => {
    const recent = new Date(now.getTime() - 60 * 60 * 1000);
    expect(shouldAutoDisableAfterReceiverFailure(99, recent, now)).toEqual({
      disable: false,
    });
  });

  it("does not apply 24h rule when endpoint never had a success (null lastSuccessAt)", () => {
    expect(
      shouldAutoDisableAfterReceiverFailure(50, null, now)
    ).toEqual({ disable: false });
  });

  it("disables at 99 failures when last success was >24h ago (24h rule)", () => {
    const old = new Date(now.getTime() - 25 * 60 * 60 * 1000);
    expect(shouldAutoDisableAfterReceiverFailure(99, old, now)).toEqual({
      disable: true,
      reason: "no_success_24h",
    });
  });
});

describe("truncateForStorage", () => {
  it("truncates long strings", () => {
    expect(truncateForStorage("abc", 2)).toBe("ab");
  });
});
