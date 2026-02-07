# H1 — Payment Status & Evidence

## Scope

- Support payment status tracking for payable requests
- Payment statuses:
  - NOT_PAID
  - PENDING
  - PAID
- Only Finance or users with payment permission can update status
- Block action if request type is not payable


---

# Definition of Done


## Core Behavior

- A request can have at most one associated payment record
- Payment record is upserted (1 per request)
- Status transitions are tracked
- A RequestEvent is created:
  - `request.payment.status_set`
- Action is blocked if request type is not payable


---

## Authorization Rules

To set payment status, acting user must:

1. Have access to the request (C1)
AND
2. Have permission:
   - `tenant.payments.set_status`
   - OR Finance/Admin equivalent

If not authorized:

- return 403 (or 404 if request not visible)


---

## Payable Validation

Before allowing status change:

- Validate request.type is marked as payable

Implementation options:

- Add boolean field in RequestType:
  - isPayable
OR
- Maintain configuration table for payable types

If request is not payable:

- Block action
- Return error:

"Payment not supported"


---

## Payment Status Model

### RequestPayment

- id
- tenantId
- requestId (UNIQUE)
- status (NOT_PAID | PENDING | PAID)
- setAt (UTC)
- setByUserId
- metadataJson (optional)
- createdAt
- updatedAt

Constraints:

- UNIQUE (requestId)
- tenantId must match Request.tenantId

Indexes:

- (tenantId, status)
- (tenantId, requestId)


---

## Status Transition Rules

Allowed transitions:

- NOT_PAID → PENDING
- NOT_PAID → PAID
- PENDING → PAID
- PENDING → NOT_PAID (optional, must be explicit)
- PAID → NOT_PAID (optional, must be explicit)
- PAID → PENDING (optional, must be explicit)

Default v1 recommendation:

- Allow full flexibility but always log transition


---

## Event Creation

### RequestEvent: `request.payment.status_set`

Metadata:

- requestId
- previousStatus
- newStatus
- setByUserId

Must be appended to timeline.


---

## Closed Request Rule

If request.status = CLOSED:

- Default v1 behavior:
  - Payment status can still be updated (recommended)
  - Because closing does not imply payment

If business rules require restriction:
- Must be explicitly defined


---

## Upsert Logic

Payment logic must:

- If no RequestPayment exists:
  - Create with status
- If exists:
  - Update status

All within a single transaction.


---

# Acceptance Criteria

- For payable request types:
  - Finance can mark PENDING or PAID
  - Status is persisted
  - RequestEvent created

- For non-payable request types:
  - Action blocked
  - Error returned:
    - "Payment not supported"

- Payment record exists only once per request
- Status updates appear in timeline


---

# Edge Cases

- Attempt to set same status twice:
  - Idempotent success OR no-op (recommended)
- Request does not exist:
  - 404
- Cross-tenant attempt:
  - 404
- Concurrent status updates:
  - Use atomic update with predicate if needed


---

# Concurrency Safety

- Use upsert with unique constraint (requestId)
- If updating:
  - optionally check current status to avoid lost update
- Wrap update + RequestEvent in transaction


---

# Best Practices

- Store previousStatus in event metadata
- Use UTC timestamps
- Keep payment model independent from request.status
- Do not embed payment logic directly into Request table
- Avoid cascading deletes


---

# Future Enhancements (Not v1)

- Payment evidence attachment (file upload integration)
- Partial payments
- Payment amount tracking
- Payment due date
- Payment method tracking
- Automatic status change on external webhook
- Payment SLA metrics
