# B1 — Create Request

> Implement per `00-EPIC-QUALITY-AND-PRACTICES.md` and `.cursor/rules`.
> Rules enforced: `00-core-constitution.mdc`, `security-multitenancy.mdc`,
> `authorization-rbac-and-request-access.mdc`, `api-contract-validation-errors.mdc`,
> `api-security.mdc`, `audit-log.mdc`, `plans-usage-billing.mdc`,
> `error-handling-and-resilience.mdc`, `prisma-and-performance.mdc`,
> `caching-strategy.mdc`, `testing-and-quality.mdc`, `definition-of-done.mdc`.

---

## Scope

Create a new request record scoped to a tenant with:

- `type` (`RequestType`)
- `title`
- `amount` (optional)
- `currency` (optional)
- `metadataJson` (optional)

Default status on creation: **OPEN**

---

## API Contract

### Endpoint
POST /api/requests
### Request Body (Zod-validated)

```ts
z.object({
  title:       z.string().min(1).max(255).trim(),
  type:        z.nativeEnum(RequestType),
  amount:      z.number().min(0).optional(),
  currency:    z.string().regex(/^[A-Z]{3}$/).optional(), // ISO 4217
  metadataJson: z.record(z.unknown()).optional(),
})
```

Rules:
- `title` is required, trimmed, non-empty
- `amount` must be >= 0 if provided
- `currency` must match ISO 4217 format (3 uppercase letters) if provided
- `currency` without `amount` is valid (and vice versa) unless business rules say otherwise
- Body validated with Zod **before** any business logic runs
- `Content-Type: application/json` enforced — reject with 415 otherwise

### Success Response — 201 Created

```json
{
  "data": {
    "id": "req_...",
    "tenantId": "...",
    "title": "...",
    "type": "...",
    "status": "OPEN",
    "amount": null,
    "currency": null,
    "createdAt": "2025-01-01T00:00:00.000Z"
  }
}
```

### Error Responses

| Scenario | HTTP | Error Code |
|---|---|---|
| Unauthenticated | 401 | `UNAUTHENTICATED` |
| Missing permission `tenant.requests.create` | 403 | `FORBIDDEN` |
| Validation error (missing title, bad amount, bad currency) | 400 | `VALIDATION_ERROR` |
| Plan limit exceeded | 403 | `UPGRADE_REQUIRED` |
| Subscription inactive / canceled | 403 | `SUBSCRIPTION_INACTIVE` |
| Rate limit exceeded | 429 | `RATE_LIMITED` |
| Internal error | 500 | `INTERNAL_ERROR` |

All errors use the standard shape:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message",
    "details": {}
  }
}
```

---

## Security Rules

- Tenant context resolved **server-side** from authenticated session + membership records — never from request body or query params
- Permission `tenant.requests.create` verified server-side via shared RBAC helper before any mutation
- Platform-blocked users denied with 403 before any business logic
- Rate limiting applied per `userId` + `tenantId` for this endpoint (authenticated tier)
- No sensitive internal details, stack traces, or raw DB errors returned to client

---

## Route Handler Implementation Rules
 
 POST /api/requests → src/app/api/requests/route.ts

 Required structure (in order):

1. Top-level `try/catch` error boundary (always)
2. `Content-Type` validation → 415 if not `application/json`
3. `getServerSession` → 401 if no session
4. Resolve tenant context from membership (server-side) → 403/404 if invalid
5. Platform-block check → 403 if blocked
6. RBAC check: `tenant.requests.create` → 403 if missing
7. Rate limit check → 429 if exceeded
8. Zod parse + validate request body → 400 if invalid
9. Resolve tenant plan: `resolveTenantPlan(tenantId)`
10. Check subscription active state → 403 `SUBSCRIPTION_INACTIVE` if inactive
11. Atomic usage consume + request creation in a **single DB transaction**:
    a. `tryConsumeRequest(tenantId, yearMonth, maxRequestsPerMonth)` → 403 `UPGRADE_REQUIRED` if false
    b. `db.request.create(...)` with all required fields
    c. `db.requestEvent.create(...)` — `request.created`
    d. `db.auditLog.create(...)` — `request.created`
12. Return 201 with sanitized response
13. `catch` → log safely → return 500

Rules:
- Steps 11a–11d inside a single `db.$transaction([...])`
- Audit log is **not** best-effort for this action — it must commit with the request or the entire transaction rolls back
- Usage counter increments **only** if transaction commits successfully
- Never return raw Prisma errors, stack traces, or internal metadata

---

## Definition of Done

### Core Behavior

Request created with:
- `id` (generated server-side)
- `tenantId` (from server-resolved context)
- `createdByUserId` (from session)
- `title` (trimmed)
- `type` (RequestType)
- `status = OPEN`
- `amount` (nullable)
- `currency` (nullable, ISO 4217)
- `metadataJson` (nullable)
- `createdAt` (UTC)
- `updatedAt` (UTC)

Audit events generated (inside transaction):
- `AuditLog` entry: action `request.created`
- `RequestEvent`: event `request.created`

Monthly usage consumed (inside same transaction):
- `TenantUsageMonthly.requestsCreated` incremented atomically
- Hard-limit safe and concurrency-safe (predicate update, no double-count)

---

## Gating + Pricing Integration

Before creating the request (in order):

1. `resolveTenantPlan(tenantId)` — get effective plan + limits
2. Verify `subscription.isActive === true` → else 403 `SUBSCRIPTION_INACTIVE`
3. Inside transaction: `tryConsumeRequest(tenantId, yearMonth, maxRequestsPerMonth)`
   - If `false` → abort transaction → 403 `UPGRADE_REQUIRED`
   - Counter must **not** increment if transaction does not commit
4. Create request record (same transaction)
5. Write `RequestEvent` + `AuditLog` (same transaction)
6. Transaction commits → 201 response

---

## Data Model

### Request

| Field | Type | Rules |
|---|---|---|
| `id` | String (cuid/uuid) | PK, generated server-side |
| `tenantId` | String | FK, non-nullable, indexed |
| `createdByUserId` | String | FK, non-nullable |
| `title` | String | non-nullable, max 255 |
| `type` | RequestType (enum) | non-nullable |
| `status` | RequestStatus (enum) | default OPEN |
| `amount` | Decimal? | nullable, >= 0 |
| `currency` | String? | nullable, ISO 4217 |
| `metadataJson` | Json? | nullable |
| `createdAt` | DateTime | UTC, default now() |
| `updatedAt` | DateTime | UTC, auto-updated |

### Indexes (required)

```prisma
@@index([tenantId, createdAt(sort: Desc)])
@@index([tenantId, createdByUserId, createdAt(sort: Desc)])
@@index([tenantId, status, createdAt(sort: Desc)])
```

---

## Events

### RequestEvent

| Field | Type |
|---|---|
| `id` | PK |
| `tenantId` | FK, non-nullable |
| `requestId` | FK, non-nullable |
| `actorUserId` | String, non-nullable |
| `event` | String (`request.created`) |
| `occurredAt` | DateTime UTC |
| `metadataJson` | Json? |

---

## Audit Log

Entry written inside the same transaction as request creation.

| Field | Value |
|---|---|
| `actorUserId` | session user id |
| `tenantId` | resolved tenant id |
| `action` | `request.created` |
| `entityType` | `Request` |
| `entityId` | new request id |
| `metadata` | `{ requestType, title, amount?, currency? }` |
| `createdAt` | UTC |

Rules:
- No raw tokens, secrets, or unnecessary PII in metadata
- `requestId` included for traceability
- Audit log failure = transaction rollback (not best-effort)

---

## Caching

- No cached data is read during request creation (always fresh DB reads for plan + permissions)
- After successful creation, invalidate if applicable:
  - `tenant:${tenantId}:requests:list` (if list is cached)
  - `tenant:${tenantId}:usage:monthly` (if usage summary is cached)
- Cached plan state **must not** be used for enforcement — always re-fetch for mutations

---

## Rate Limiting

- Tier: **Authenticated**
- Key: `userId` + `tenantId`
- Apply via existing rate limit helper for this endpoint tier
- Return 429 with `Retry-After` header on breach

---

## Acceptance Criteria

- User with `tenant.requests.create` can successfully create a request → 201
- Plan limit exceeded → 403 `UPGRADE_REQUIRED`, counter does not increment
- Subscription inactive → 403 `SUBSCRIPTION_INACTIVE`
- Missing `title` → 400 `VALIDATION_ERROR`
- `amount` negative → 400 `VALIDATION_ERROR`
- `currency` invalid format → 400 `VALIDATION_ERROR`
- User without permission → 403 `FORBIDDEN`
- Unauthenticated request → 401 `UNAUTHENTICATED`
- Platform-blocked user → 403 `FORBIDDEN`
- Concurrent create attempts cannot exceed plan limit (atomic counter)
- No duplicate `TenantUsageMonthly` rows created under concurrency
- `AuditLog` + `RequestEvent` created on success
- `AuditLog` + `RequestEvent` NOT created if request creation fails
- Request appears in "My Requests" list after creation

---

## Edge Cases

| Case | Expected Behavior |
|---|---|
| Missing title | 400 validation error |
| Amount negative | 400 validation error |
| Currency invalid format | 400 validation error |
| Subscription inactive | 403 `SUBSCRIPTION_INACTIVE` |
| Plan limit reached | 403 `UPGRADE_REQUIRED` |
| No `tenant.requests.create` permission | 403 `FORBIDDEN` |
| Platform-blocked user | 403 `FORBIDDEN` |
| DB transaction fails mid-flight | Full rollback, counter not incremented, 500 returned |
| Concurrent requests at limit boundary | Only one succeeds, other gets 403 `UPGRADE_REQUIRED` |

---

## Required Test Coverage

Per `testing-and-quality.mdc`:

### Happy path
- Authenticated user with permission creates request → 201, all fields correct
- `AuditLog` entry created with correct fields
- `RequestEvent` created with correct fields
- `TenantUsageMonthly.requestsCreated` incremented

### Auth & permission negative cases
- No session → 401
- Valid session, no `tenant.requests.create` permission → 403
- Platform-blocked user → 403
- Cross-tenant attempt (valid auth, wrong tenant) → 403/404

### Validation negative cases
- Missing `title` → 400
- Empty `title` → 400
- `amount` = -1 → 400
- `currency` = `"us"` (invalid) → 400
- `currency` = `"USDD"` (invalid) → 400

### Plan gating
- Usage at limit → 403 `UPGRADE_REQUIRED`
- Counter not incremented when blocked
- Counter not incremented when request creation fails

### Concurrency
- Two concurrent requests at the limit boundary → exactly one succeeds

---

## Future Enhancements (Not v1)

- Draft requests (status: DRAFT)
- Additional statuses: SUBMITTED / APPROVED / REJECTED
- Request templates
- Attachments/evidence required by type
- Form schema per RequestType
- Webhook emission on `request.created` for external integrations

