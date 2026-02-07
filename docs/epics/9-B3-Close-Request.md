# B3 — Close Request

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

- Close a request (soft state change, not deletion)
- Only Finance/Admin or users with permission `tenant.requests.close` can perform the action
- Prevent further approval/payment actions once closed


---

# Definition of Done


## Core Behavior

- Request status changes:
  - from: OPEN
  - to: CLOSED

- Fields updated:
  - status = CLOSED
  - closedAt (UTC timestamp)
  - closedByUserId

- A RequestEvent is created:
  - `request.closed`

- An AuditLog entry is created:
  - `request.closed`

- The request is NOT deleted
- Historical data remains intact


---

## Authorization Rules

Only users who meet at least one condition may close:

- Have permission `tenant.requests.close`
- Are Finance role
- Are Admin role

Permission must be enforced at backend level.


---

## State Transition Rules

Valid transition:

- OPEN → CLOSED

Invalid transitions:

- CLOSED → CLOSED (idempotent allowed or reject)
- CLOSED → OPEN (not allowed in v1 unless reopening feature is defined)

System must validate current status before applying change.


---

## Post-Close Behavior

Once a request is CLOSED:

- Approve action must be blocked
- Payment action must be blocked
- Status changes must be blocked (unless explicitly allowed in future)
- Editing core fields should be restricted (recommended)

Blocking behavior:

- Return 400 or 409 (conflict)
- Message example:

"Request is closed"


---

## Data Model Impact

### Request

Fields:

- status (OPEN | CLOSED)
- closedAt (nullable)
- closedByUserId (nullable)

Indexes (recommended):

- (tenantId, status)
- (tenantId, closedAt DESC)


---

## Events

### RequestEvent

Create event:

- `request.closed`

Fields:

- tenantId
- requestId
- actorUserId
- occurredAt (UTC)
- metadataJson (optional)

Example metadata:

- previousStatus
- newStatus


---

## Audit Logging (K1)

Create AuditLog entry:

ActionKey:

- `request.closed`

Recommended metadataJson:

- requestId
- closedByUserId
- previousStatus
- newStatus


---

# Acceptance Criteria

- Finance/Admin can close a request successfully
- Member without `tenant.requests.close` receives:
  - 403 Forbidden

- If request is CLOSED:
  - Approve action is blocked
  - Payment action is blocked
  - System returns clear error

- Request remains visible in lists (not deleted)
- AuditLog + RequestEvent are created upon successful close


---

# Edge Cases

- Attempt to close non-existent request → 404
- Attempt to close request from another tenant → 404
- Attempt to close already CLOSED request:
  - Option A (recommended): idempotent success (no change)
  - Option B: 409 Conflict

- User removed mid-operation → permission re-validated at execution time


---

# Transaction Rules

- Status update + RequestEvent + AuditLog must be in the same transaction
- If any step fails → entire operation rolls back
- closedAt must be server-generated UTC time


---

# Best Practices

- Enforce access using centralized permission checks
- Validate status transition before applying update
- Do not rely on frontend state validation
- Keep CLOSED immutable in v1 (no reopen)
- Emit events only after successful commit


---

# Future Enhancements (Not v1)

- Reopen request feature
- Close with reason
- Automatic close after payment
- Lock record fully after close
- SLA tracking (time to close)
