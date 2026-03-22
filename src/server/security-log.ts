import "server-only";

/**
 * Structured security event logger for operational visibility.
 *
 * These are stdout logs for incident investigation and monitoring.
 * They are separate from writeAuditLog (persistent DB audit trail).
 *
 * Rules:
 * - Never log: emails, names, passwords, tokens, secrets, full request bodies
 * - Always include: event name, timestamp, and whatever context is safe
 * - Use stable dot-separated event names for log filtering/alerting
 */

function now(): string {
  return new Date().toISOString();
}

// ── Authentication ──────────────────────────────────────────────────────────

/** Login or OTP verification failed */
export function logAuthFailure(params: {
  event: "auth.login.failed" | "auth.otp.failed" | "auth.passkey.failed";
  userId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  reason?: string | null;
}): void {
  // eslint-disable-next-line no-console
  console.warn("[security]", {
    event: params.event,
    timestamp: now(),
    userId: params.userId ?? null,
    ip: params.ip ?? null,
    userAgent: params.userAgent ? params.userAgent.slice(0, 200) : null,
    reason: params.reason ?? null,
  });
}

/** Request arrived with an invalid or expired session */
export function logSessionInvalid(params: {
  reason: "expired" | "revoked" | "not_found" | "pending_mfa" | "mfa_not_verified";
  userId?: string | null;
  ip?: string | null;
}): void {
  // eslint-disable-next-line no-console
  console.warn("[security]", {
    event: "auth.session.invalid",
    timestamp: now(),
    reason: params.reason,
    userId: params.userId ?? null,
    ip: params.ip ?? null,
  });
}

// ── Authorization ───────────────────────────────────────────────────────────

/** Authenticated request was denied by RBAC or permission check */
export function logForbidden(params: {
  userId: string;
  tenantId?: string | null;
  permission?: string | null;
  ip?: string | null;
  path?: string | null;
}): void {
  // eslint-disable-next-line no-console
  console.warn("[security]", {
    event: "api.forbidden",
    timestamp: now(),
    userId: params.userId,
    tenantId: params.tenantId ?? null,
    permission: params.permission ?? null,
    ip: params.ip ?? null,
    path: params.path ?? null,
  });
}

/** Request to protected endpoint without a valid session */
export function logUnauthenticated(params: { ip?: string | null; path?: string | null }): void {
  // info level — unauthenticated hits on protected APIs are common (expired sessions, etc.)
  // eslint-disable-next-line no-console
  console.info("[security]", {
    event: "api.unauthenticated",
    timestamp: now(),
    ip: params.ip ?? null,
    path: params.path ?? null,
  });
}

// ── Rate limiting ───────────────────────────────────────────────────────────

/** Request was rejected by the rate limiter */
export function logRateLimited(params: {
  key: string;
  userId?: string | null;
  tenantId?: string | null;
  ip?: string | null;
  path?: string | null;
}): void {
  // eslint-disable-next-line no-console
  console.warn("[security]", {
    event: "api.rate_limited",
    timestamp: now(),
    // key is safe — it's our own composite key like "2fa:verify:userId", not user-supplied
    key: params.key,
    userId: params.userId ?? null,
    tenantId: params.tenantId ?? null,
    ip: params.ip ?? null,
    path: params.path ?? null,
  });
}

// ── Webhook security ────────────────────────────────────────────────────────

/** Webhook received with invalid signature */
export function logWebhookSignatureInvalid(params: { provider: string; ip?: string | null }): void {
  // eslint-disable-next-line no-console
  console.warn("[security]", {
    event: "webhook.signature_invalid",
    timestamp: now(),
    provider: params.provider,
    ip: params.ip ?? null,
  });
}

/** Duplicate webhook event ID detected — possible replay attack */
export function logWebhookReplayDetected(params: {
  provider: string;
  eventId: string;
  eventType: string;
}): void {
  // eslint-disable-next-line no-console
  console.warn("[security]", {
    event: "webhook.replay_detected",
    timestamp: now(),
    provider: params.provider,
    // eventId is provider-supplied and safe to log (it's Paddle's evt_xxx ID)
    eventId: params.eventId,
    eventType: params.eventType,
  });
}

// ── Tenant isolation ────────────────────────────────────────────────────────

/** Cross-tenant access attempt detected */
export function logTenantIsolationViolation(params: {
  userId: string;
  attemptedTenantId: string;
  actualTenantId?: string | null;
  ip?: string | null;
  path?: string | null;
}): void {
  // error level — this should never happen in normal operation
  // eslint-disable-next-line no-console
  console.error("[security]", {
    event: "api.tenant_isolation_violation",
    timestamp: now(),
    userId: params.userId,
    attemptedTenantId: params.attemptedTenantId,
    actualTenantId: params.actualTenantId ?? null,
    ip: params.ip ?? null,
    path: params.path ?? null,
  });
}
