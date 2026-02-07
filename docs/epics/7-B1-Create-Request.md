# B1 — Create Request

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

- Create a request (record) with:
  - type (`RequestType`)
  - metadata
- Default request status: **OPEN**


---

# Definition of Done


## Core Behavior

- Request is created with:
  - tenantId
  - createdByUserId
  - title
  - type (RequestType)
  - metadata (JSON)
  - status = OPEN
  - createdAt (UTC)

- Audit events generated:
  - AuditLog entry (K1)
  - RequestEvent: `request.created`

- Monthly usage consumption is applied for pricing:
  - increments `TenantUsageMonthly.requestsCreated` (J2)
  - must be **hard-limit safe** and concurrency-safe

- Validations enforced:
  - title required
  - amount >= 0 (if amount exists)
  - currency format validation (ISO code recommended, e.g., USD, CRC)


---

## Gating + Pricing Integration (Aligned with J1 + J2)

Before creating the request:

1. Resolve tenant plan:
   - `resolveTenantPlan(tenantId)` (J1)
2. Validate feature access (if any feature flag applies)
3. Consume monthly usage atomically:
   - `tryConsumeRequest(tenantId, yearMonth, maxRequestsPerMonth)` (J2)
   - If returns false → block with:
     - "Upgrade required"
4. Create request record
5. Write audit log + request event
6. Commit transaction

Rules:

- Counter increments only if the request is successfully created (transaction commits)
- If request creation fails → counter must not increment (rollback)


---

## Data Model (Minimum)

### Request

- id
- tenantId
- createdByUserId
- title
- type (RequestType)
- status (OPEN)
- amount (nullable)
- currency (nullable)
- metadataJson (nullable)
- createdAt
- updatedAt

Indexes (recommended):

- (tenantId, createdAt DESC)
- (tenantId, createdByUserId, createdAt DESC)
- (tenantId, status, createdAt DESC)


---

## Events

### RequestEvent

Event created:

- `request.created`

Minimum event fields:

- tenantId
- requestId
- actorUserId
- occurredAt
- metadataJson (optional)


---

## Audit Logging (K1)

AuditLog entry created:

- `request.created`

Recommended metadataJson:

- requestId
- requestType
- title
- amount (if present)
- currency (if present)


---

# Acceptance Criteria

- A user with permission `tenant.requests.create` can create a request
- If the plan monthly request limit is exceeded (Free/Starter):
  - the request is blocked
  - error returned: "Upgrade required"
  - usage counter does not increment
- The request appears in “My Requests”
- AuditLog + RequestEvent are created for the successful creation
- Concurrency correctness:
  - two concurrent create attempts cannot exceed the plan limit
  - no duplicate month rows are created for usage counters


---

# Edge Cases

- Missing title → validation error
- Amount provided but negative → validation error
- Currency provided but invalid format → validation error
- Plan inactive (`subscription.isActive = false`) → block + log
- User lacks permission `tenant.requests.create` → forbidden


---

# Best Practices

- Use server-side validation even if UI validates
- Use UTC timestamps
- Create request + consume usage in a single transaction
- Use atomic consume with predicate update (J2) to enforce hard limits
- Emit audit/event only after successful persistence (commit-safe)


---

# Future Enhancements (Not v1)

- Draft requests
- Additional statuses (SUBMITTED / APPROVED / REJECTED)
- Request templates
- Attachments/evidence required by type
- Form schema per RequestType
