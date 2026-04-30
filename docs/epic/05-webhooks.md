# Relitrue EPIC — Webhooks

> **Version:** 1.0 — 2026-04-29  
> **Status:** Active  
> **Master Plan reference:** [00-master-plan.md](./00-master-plan.md), Decisions D-005, D-008, D-010  
> **Depends on:** [01-access-model.md](./01-access-model.md), [03-assignment-engine.md](./03-assignment-engine.md), [04-delegations-ooo.md](./04-delegations-ooo.md)  
> **Constitution references:** `secrets-and-cryptography.mdc`, `api-versioning-and-deprecation.mdc`, `background-jobs-and-async.mdc`  
> **Implementing Phase:** B (schema), C (CRUD APIs), D (delivery worker + retry)

## Section 1 — Purpose

Webhooks let external systems (ERPs, payment processors, BI tools, custom integrations) receive real-time notifications when events occur in Relitrue.

Customers configure HTTP endpoints to receive POST callbacks with JSON payloads.

Each delivery is signed with **HMAC SHA256** (D-008) so receivers can verify authenticity.

Webhook delivery is **at-least-once** with exponential backoff retry.

Failed deliveries route to a dead-letter state (`FAILED_FINAL`) with admin-visible alerting.

Webhooks are **plan-gated to Enterprise tier** (D-005) for revenue protection and infrastructure cost justification.

Feature-flag policy (D-010): high-risk infrastructure may additionally require `FT_WEBHOOKS_ENABLED` per tenant; if used, engine and APIs must fail closed when disabled.

Explicit statements:

- Webhook payloads are **versioned** — schema changes require a new payload version (per `api-versioning-and-deprecation.mdc`).
- Delivery is **asynchronous** — never blocks the originating user-facing action; enqueue happens in the same DB transaction where safe, worker performs HTTP out-of-band.
- Receivers have **5 seconds** to respond with **2xx**; otherwise the attempt is treated as failure.
- Tenants can configure **multiple endpoints** (e.g., separate URLs per environment or per integration), subject to plan limits.

Non-goals for v1:

- Webhooks are not a guaranteed real-time SLA product; they are best-effort with retries.
- Webhooks do not replace internal audit logs or internal notifications.

## Section 2 — WebhookEndpoint Model

```prisma
enum WebhookEndpointStatus {
  ACTIVE
  PAUSED          // admin-paused; deliveries skipped but endpoint preserved
  DISABLED_AUTO   // automatically disabled after sustained failures
}

model WebhookEndpoint {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation("TenantWebhookEndpoints", fields: [tenantId], references: [id], onDelete: Cascade)
  
  name        String  @db.VarChar(120)
  description String? @db.VarChar(500)
  url         String  @db.VarChar(2048)
  
  // Subscribed events (array of event names — see Section 4)
  // Stored as JSON array for flexibility
  subscribedEvents Json  // e.g. ["record.finance.assigned", "record.payment.status_changed"]
  
  // HMAC SHA256 signing secret (D-008). Stored hashed; raw shown ONCE on creation.
  secretHash  String  @db.VarChar(64)  // SHA-256 of the secret
  secretHint  String  @db.VarChar(8)   // Last 4 chars of raw secret for UI ("...a3f9")
  
  // Status + auto-disable tracking
  status      WebhookEndpointStatus @default(ACTIVE)
  consecutiveFailures Int @default(0)
  lastSuccessAt DateTime? @db.Timestamptz(6)
  lastFailureAt DateTime? @db.Timestamptz(6)
  disabledAutoAt DateTime? @db.Timestamptz(6)
  disabledAutoReason String? @db.VarChar(500)
  
  // Lifecycle
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  createdByUserId String?
  createdByUser   User?     @relation("WebhookEndpointCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)
  deletedAt       DateTime? @db.Timestamptz(6)
  
  // Relations
  deliveries  WebhookDelivery[]
  
  @@index([tenantId, status, deletedAt])
  @@index([tenantId, deletedAt, createdAt])
}
```

Constraints:

- `url` MUST be HTTPS in production; HTTP allowed only in development tenant flag.
- `url` MUST NOT resolve to private IP ranges (per `application-security.mdc` SSRF prevention).
- `subscribedEvents` MUST contain at least 1 event from the catalog (Section 4).
- Auto-disable: after **100 consecutive failures** over **24 hours**, status auto-transitions to `DISABLED_AUTO` (exact composite rule in Section 7).
- Maximum **10 active endpoints** per tenant (configurable via plan).

Implementation notes:

- Raw signing secret is never persisted; only `secretHash` and `secretHint`.
- Dual-secret rotation (24h overlap) requires a second hash field in implementation if not shown in this v1 schema sketch — add during Phase C if needed.
- `PAUSED` endpoints skip new deliveries; in-flight may complete per worker policy.

## Section 3 — WebhookDelivery Model

Each delivery attempt is persisted for audit + retry coordination:

```prisma
enum WebhookDeliveryStatus {
  PENDING       // queued, not yet attempted
  IN_FLIGHT     // currently being delivered
  SUCCEEDED     // 2xx response within timeout
  FAILED_RETRY  // failed, will be retried
  FAILED_FINAL  // exhausted retries; in dead-letter
  CANCELED      // endpoint disabled before delivery
}

model WebhookDelivery {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation("TenantWebhookDeliveries", fields: [tenantId], references: [id], onDelete: Cascade)
  
  endpointId  String
  endpoint    WebhookEndpoint @relation(fields: [endpointId], references: [id], onDelete: Cascade)
  
  // Event identity
  eventId     String  @db.VarChar(64)  // unique idempotency key per event (matches X-Relitrue-Event-Id header)
  eventName   String  @db.VarChar(80)  // e.g. "record.finance.assigned"
  payloadVersion String @db.VarChar(8) @default("v1")
  
  // Payload (stored for replay + audit)
  payload     Json
  
  // Delivery state
  status      WebhookDeliveryStatus @default(PENDING)
  attemptCount Int @default(0)
  maxAttempts Int @default(8)  // exponential backoff: 1m, 5m, 15m, 1h, 6h, 24h, 24h, 24h
  nextAttemptAt DateTime? @db.Timestamptz(6)
  
  // Result tracking
  lastResponseStatus Int?
  lastResponseDurationMs Int?
  lastResponseBodyExcerpt String? @db.VarChar(1000)  // first 1000 chars of response for debugging
  lastErrorMessage String? @db.VarChar(500)
  
  // Lifecycle
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  succeededAt DateTime? @db.Timestamptz(6)
  finalFailedAt DateTime? @db.Timestamptz(6)
  
  @@index([tenantId, status, nextAttemptAt])  // for delivery worker queries
  @@index([tenantId, endpointId, status, createdAt])
  @@index([tenantId, eventId])  // for deduplication
  @@index([tenantId, status, createdAt])  // for admin dashboard
}
```

Storage notes:

- `eventId` is unique per `(tenantId, eventName, businessKey)` — built from the source entity (e.g., for `record.finance.assigned`, `eventId = record.finance.assigned:${recordId}:${assignedAt.getTime()}`).
- Receiver can dedupe using `eventId` (`X-Relitrue-Event-Id` header).
- Payload is preserved for at least **30 days** (admin can replay during this window).
- Old delivery records cleaned by nightly job per retention policy.

Idempotency:

- Enqueue path should use deterministic `eventId` where possible to avoid duplicate rows for the same business event.
- If duplicate enqueue occurs, worker dedupe may rely on unique constraint `(tenantId, eventId, endpointId)` if added in Phase B — design decision at migration time.

## Section 4 — Event Catalog

The events that can be subscribed to in v1:

| Event Name | Description | Payload Source |
| --- | --- | --- |
| `record.created` | New record submitted | Record creation handler |
| `record.approval.requested` | Record entered approval flow | A4 reconciler |
| `record.approval.fully_completed` | All required approvals complete | A4 reconciler `APPROVAL_FULLY_COMPLETED` event |
| `record.approval.rejected` | Record rejected by an approver | A4 reconciler `APPROVAL_REJECTED_FINAL` event |
| `record.finance.assigned` | Auto-assignment engine assigned a record | Doc 03 engine |
| `record.finance.reassigned` | Record reassigned (manual or via delegation handoff) | Doc 03 engine + Doc 04 handoff |
| `record.finance.released` | Member released assignment back to pool | Doc 03 queue release |
| `record.finance.completed` | Finance work done | Doc 03 queue complete |
| `record.payment.status_changed` | Payment status transitioned | Payment handler (existing) |
| `record.closed` | Record closed (terminal state) | Record close handler |
| `delegation.activated` | Delegation transitioned to ACTIVE | Doc 04 cron |
| `delegation.expired` | Delegation transitioned to EXPIRED | Doc 04 cron |
| `delegation.revoked` | Delegation manually revoked | Doc 04 API |

Future events (not in v1): `member.invited`, `tenant.plan.changed`, `audit.log.created` — added in subsequent versions.

Catalog governance:

- New events require payload schema + version bump when breaking.
- Deprecated events must carry sunset date per constitution.

## Section 5 — Payload Schema

All webhook payloads share a common envelope:

```typescript
type WebhookPayload<T> = {
  // Envelope
  id: string;                    // matches WebhookDelivery.eventId
  event: string;                 // event name from Section 4
  version: "v1";                 // payload version
  occurredAt: string;            // ISO 8601 timestamp of the actual event
  deliveredAt: string;           // ISO 8601 timestamp of THIS delivery attempt
  
  // Tenant context
  tenant: {
    id: string;
    slug: string;
    name: string;
  };
  
  // Event-specific data
  data: T;
};
```

Example for `record.finance.assigned`:

```typescript
type RecordFinanceAssignedData = {
  record: {
    id: string;
    title: string;
    type: string;                // RecordType enum value
    requestedAmount: number | null;
    currencyCode: string | null;
    createdAt: string;
    createdByUserId: string;
  };
  assignment: {
    membershipId: string;
    userId: string;
    userName: string | null;
    userEmail: string | null;
    teamId: string;
    teamName: string;
    ruleId: string | null;
    ruleName: string | null;
    strategy: string;            // AssignmentStrategy enum value
    assignedAt: string;
  };
};
```

Each event has its own `data` schema, documented in `docs/epic/payloads/` (subdirectory created during Phase C).

Payload versioning rules:

- `version: "v1"` is fixed in envelope until a breaking change introduces `v2`.
- Non-breaking additive fields may ship within `v1` with documented defaults.

## Section 6 — Signing + Verification (D-008)

Every delivery is signed using HMAC SHA256.

#### Signing process (server-side)

```pseudocode
function signPayload(payloadJson: string, secret: string): string {
  // 1. Compute HMAC SHA256
  const signature = hmacSha256(secret, payloadJson)
  // 2. Hex-encode
  return `sha256=${signature.toString('hex')}`
}
```

#### Headers sent to receiver

| Header | Value | Purpose |
| --- | --- | --- |
| `Content-Type` | `application/json` | Standard |
| `User-Agent` | `Relitrue-Webhook/v1` | Identifies our webhook deliverer |
| `X-Relitrue-Event-Id` | `WebhookDelivery.eventId` | Idempotency key for receiver dedupe |
| `X-Relitrue-Event-Name` | `WebhookDelivery.eventName` | Event type |
| `X-Relitrue-Payload-Version` | `v1` | Version pin |
| `X-Relitrue-Delivery-Id` | `WebhookDelivery.id` | Specific attempt ID |
| `X-Relitrue-Delivery-Attempt` | `attemptCount` | 1, 2, 3... |
| `X-Relitrue-Timestamp` | Unix epoch seconds | Signing timestamp |
| `X-Relitrue-Signature` | `sha256=<hex>` | HMAC SHA256 of body |

#### Verification (receiver-side)

Documentation example for receivers:

```typescript
import { createHmac, timingSafeEqual } from "crypto";

function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  const expected = `sha256=${createHmac('sha256', secret).update(rawBody).digest('hex')}`;
  // Use timing-safe equality
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}
```

The raw body MUST be used (not parsed JSON re-stringified) because JSON serialization order can vary.

Optional hardening (document for receivers):

- Reject requests if `X-Relitrue-Timestamp` skew exceeds ±5 minutes (Section 10).

## Section 7 — Delivery Worker

Background worker processes the `WebhookDelivery` queue.

#### Triggering

When an event occurs (e.g., assignment created), the originating handler enqueues a delivery row per matching endpoint:

```pseudocode
function enqueueWebhookDeliveries(tenantId, eventName, payloadData, tx) {
  endpoints = tx.webhookEndpoint.findMany({
    where: {
      tenantId,
      status: 'ACTIVE',
      deletedAt: null,
      // subscribedEvents JSON contains eventName
    }
  })
  
  if (endpoints.length === 0) return  // no subscribers, no-op
  
  payload = buildPayload(eventName, tenantId, payloadData)  // includes envelope
  eventId = `${eventName}:${payloadData.businessKey}:${now()}`
  
  for (endpoint of endpoints) {
    await tx.webhookDelivery.create({
      data: {
        tenantId,
        endpointId: endpoint.id,
        eventId,
        eventName,
        payloadVersion: 'v1',
        payload,
        status: 'PENDING',
        nextAttemptAt: now(),  // immediately eligible
      }
    })
  }
}
```

#### Worker loop (cron + queue-style)

```pseudocode
function deliveryWorkerTick() {
  // 1. Claim batch of pending deliveries (FOR UPDATE SKIP LOCKED for concurrency)
  batch = db.$queryRaw`
    UPDATE "WebhookDelivery" 
    SET status = 'IN_FLIGHT'
    WHERE id IN (
      SELECT id FROM "WebhookDelivery"
      WHERE status IN ('PENDING', 'FAILED_RETRY')
        AND nextAttemptAt <= NOW()
      ORDER BY nextAttemptAt ASC
      LIMIT 50
      FOR UPDATE SKIP LOCKED
    )
    RETURNING *
  `
  
  for (delivery of batch) {
    await deliverOne(delivery)
  }
}

function deliverOne(delivery) {
  endpoint = await db.webhookEndpoint.findUnique({ where: { id: delivery.endpointId } })
  
  if (!endpoint || endpoint.status !== 'ACTIVE') {
    return await markCanceled(delivery)
  }
  
  payloadJson = JSON.stringify(delivery.payload)
  signature = signPayload(payloadJson, getRawSecret(endpoint))  // raw secret cached or re-derived
  
  startTime = now()
  try {
    response = await fetch(endpoint.url, {
      method: 'POST',
      headers: buildHeaders(delivery, endpoint, signature),
      body: payloadJson,
      signal: AbortSignal.timeout(5000),  // 5s timeout
    })
    
    if (response.ok) {
      await markSucceeded(delivery, response, now() - startTime)
      await markEndpointSuccess(endpoint)
    } else {
      await markFailed(delivery, response, now() - startTime, `HTTP ${response.status}`)
      await markEndpointFailure(endpoint)
    }
  } catch (err) {
    await markFailed(delivery, null, now() - startTime, err.message)
    await markEndpointFailure(endpoint)
  }
}

function markFailed(delivery, response, durationMs, errorMessage) {
  newAttempt = delivery.attemptCount + 1
  
  if (newAttempt >= delivery.maxAttempts) {
    return db.webhookDelivery.update({
      where: { id: delivery.id },
      data: {
        status: 'FAILED_FINAL',
        attemptCount: newAttempt,
        finalFailedAt: now(),
        lastResponseStatus: response?.status ?? null,
        lastResponseDurationMs: durationMs,
        lastErrorMessage: errorMessage,
      }
    })
  }
  
  // Exponential backoff: 1m, 5m, 15m, 1h, 6h, 24h, 24h, 24h
  delays = [60, 300, 900, 3600, 21600, 86400, 86400, 86400]  // seconds
  delaySeconds = delays[newAttempt - 1] ?? 86400
  
  return db.webhookDelivery.update({
    where: { id: delivery.id },
    data: {
      status: 'FAILED_RETRY',
      attemptCount: newAttempt,
      nextAttemptAt: new Date(now().getTime() + delaySeconds * 1000),
      lastResponseStatus: response?.status ?? null,
      lastResponseDurationMs: durationMs,
      lastErrorMessage: errorMessage,
    }
  })
}
```

#### Auto-disable

`markEndpointFailure` increments `consecutiveFailures` on the endpoint. When the count exceeds 100 OR the time since last success exceeds 24 hours with continued failures, the endpoint auto-disables (`DISABLED_AUTO` status). Admin notified via in-app + email notification.

Worker scheduling:

- Cron `webhook-deliver` runs every **minute** (Phase D).
- Reaper `webhook-reset-stale` runs every **30 minutes** to recover stuck `IN_FLIGHT` rows (Section 12).

Plan downgrade handling:

- Before `deliverOne`, verify tenant still entitled; if not, `markCanceled` with reason `PLAN_DOWNGRADED`.

410 Gone handling:

- In `markFailed`, if `response?.status === 410`, transition to `FAILED_FINAL` immediately (no further retries).

## Section 8 — API Contract

#### `GET /api/finance/webhooks`

List endpoints. Visible to **ADMIN** and **OWNER** only.

#### `POST /api/finance/webhooks`

Create endpoint. Generates secret server-side; returns RAW secret ONCE in response.

```ts
const createWebhookSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  url: z.string().url().refine(isValidWebhookUrl, "URL must be HTTPS and not point to private IP"),
  subscribedEvents: z.array(z.enum(EVENT_CATALOG)).min(1),
});
```

Response:

```json
{
  "endpoint": { /* WebhookEndpoint without secretHash */ },
  "secret": "whsec_xxxxxxxxxxxxxxxxxxxxxxxxxx"
}
```

The raw secret is shown ONCE — UI must instruct user to copy it. Server stores only `sha256(secret)`.

Audit log: `webhook.endpoint.created`

#### `PATCH /api/finance/webhooks/[endpointId]`

Update name, description, subscribedEvents, status. Cannot change URL or secret without rotating (separate endpoint).

#### `POST /api/finance/webhooks/[endpointId]/rotate-secret`

Generate new secret. Returns RAW secret once. Old secret continues to work for 24 hours (dual-secret window — D-005 secret rotation pattern from constitution).

#### `DELETE /api/finance/webhooks/[endpointId]`

Soft delete. Pending deliveries canceled.

#### `GET /api/finance/webhooks/[endpointId]/deliveries`

List delivery history with filters (status, dateFrom, dateTo).

#### `POST /api/finance/webhooks/[endpointId]/deliveries/[deliveryId]/replay`

Admin can replay a delivery. Creates new `WebhookDelivery` row with same payload.

Audit log: `webhook.delivery.replayed`

Suggested HTTP semantics:

- List/create/patch/delete: `401` unauthenticated; `403` wrong role or not Enterprise; `404` concealed when endpoint not in tenant.
- Create: `409` when endpoint cap exceeded.
- Replay: `400` when outside retention window.

## Section 9 — Plan Gating + Limits

| Feature | Free Tier | Pro Tier | Enterprise Tier |
| --- | --- | --- | --- |
| Webhooks | ❌ | ❌ | ✅ |
| Max endpoints per tenant | 0 | 0 | 10 |
| Max subscribed events per endpoint | 0 | 0 | unlimited (from catalog) |
| Delivery history retention | n/a | n/a | 30 days |
| Replay window | n/a | n/a | 30 days |

Per D-005: webhooks are an Enterprise differentiator. Plan check enforced at:

- Create endpoint API.
- Delivery worker (skips delivery for tenants who downgraded; marks `CANCELED`).

## Section 10 — Security

Per `secrets-and-cryptography.mdc` and `application-security.mdc`:

1. **Secret storage**: only SHA-256 hash stored. Raw secret shown once on create + rotate.
2. **URL validation**: reject private IPs (10.x, 172.16-31.x, 192.168.x, 169.254.x, localhost, 127.0.0.1) at create time + delivery time.
3. **HTTPS required**: production tenants cannot register HTTP URLs.
4. **Timeout enforcement**: 5 seconds total per delivery (connect + send + receive).
5. **No follow-redirects**: 3xx responses treated as failures (security against open redirects).
6. **Body size limit**: response body capped at 1MB; truncated for storage in `lastResponseBodyExcerpt`.
7. **Signature replay protection**: receivers SHOULD validate `X-Relitrue-Timestamp` is within ±5 minutes (documented in receiver guide).
8. **Tenant isolation**: every delivery query MUST include `tenantId` (denormalized on WebhookDelivery for this).
9. **Per-tenant rate limit**: max 1000 deliveries per minute per tenant (sliding window). Excess deliveries queue.
10. **No PII leak**: payloads contain user names + emails only when relevant to the event; admin-managed endpoints can opt out via `WebhookEndpointSettings.minimizePII` (future enhancement, not v1).

## Section 11 — Observability

Per `observability-and-security-operations.mdc`:

Logging events to emit:

- `webhook.endpoint.created` (audit)
- `webhook.endpoint.disabled_auto` (audit + alert)
- `webhook.endpoint.rotated` (audit)
- `webhook.delivery.attempted` (operational, structured log)
- `webhook.delivery.succeeded` (operational)
- `webhook.delivery.failed` (operational + counter metric)
- `webhook.delivery.exhausted` (alert)
- `webhook.delivery.replayed` (audit)

Metrics to track:

- Delivery success rate per tenant per event type
- p50/p95/p99 delivery latency
- Auto-disable event count
- Dead-letter queue size

Alerts:

- Endpoint auto-disabled → immediate alert to admin (in-app + email)
- Tenant approaching delivery rate limit (>80%) → warning
- Dead-letter queue grows >500 entries → ops alert

## Section 12 — Edge Cases

1. **Receiver returns 2xx with empty body**: treated as success
2. **Receiver returns 2xx but takes 4.9 seconds**: success (under 5s timeout)
3. **Receiver returns 5xx**: retry per backoff; counts toward auto-disable
4. **Receiver returns 4xx**: retry per backoff; UNLESS **410 Gone** — treat as permanent (skip remaining retries, status `FAILED_FINAL`)
5. **DNS resolution fails**: count as failure; retry
6. **TLS handshake fails (expired cert)**: failure; retry
7. **Tenant downgrades while deliveries pending**: pending deliveries marked `CANCELED` with reason `PLAN_DOWNGRADED`
8. **Endpoint deleted while delivery IN_FLIGHT**: delivery completes; result not persisted to dead endpoint (best-effort)
9. **Same event triggers concurrent deliveries**: `eventId` uniqueness in headers lets receivers dedupe
10. **Receiver behind firewall/private network**: URL validation rejects at create time
11. **Endpoint URL changes (DNS) to point to private IP**: delivery-time validation catches and fails delivery
12. **Massive payload (>5MB)**: payload truncated with marker `__truncated__: true`; full payload stored separately for replay
13. **Worker crashes mid-batch**: `IN_FLIGHT` deliveries reset to `PENDING` after 30 minutes (timeout reaper)
14. **Tenant exceeds delivery rate limit**: excess deliveries stay in `PENDING` with future `nextAttemptAt`; not dropped

## Section 13 — Definition of Done for Webhooks Implementation

- 2 new models: `WebhookEndpoint`, `WebhookDelivery`
- 2 new enums: `WebhookEndpointStatus`, `WebhookDeliveryStatus`
- All 7 API endpoints (Section 8)
- HMAC SHA256 signing with timing-safe verification example documented
- Background worker (cron `webhook-deliver` every minute)
- Reaper worker (`webhook-reset-stale` every 30 min)
- Auto-disable after 100 consecutive failures or 24h since last success
- Plan gating enforced (Section 9)
- All Section 10 security requirements enforced
- All Section 11 observability emitted
- All 14 edge cases handled
- Audit logs fired correctly
- Integration tests for cross-tenant webhook delivery isolation (D-009): tenant A's webhook never receives tenant B's events
- Receiver verification example included in `docs/webhooks/receiving-webhooks.md` (Phase D deliverable)

## Section 14 — Changelog

```markdown
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-29 | Initial spec — endpoints + deliveries + signing + retry + auto-disable + plan gating |
```
