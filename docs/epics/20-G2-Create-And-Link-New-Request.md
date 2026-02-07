# G2 — Create & Link New Request

## Scope

- From an existing Request A, create a new Request B (prefilled)
- Automatically link B → A using relationship type:
  - `FULFILLS`
- Emit events for:
  - request creation
  - link creation
- Respect plan limits (consume monthly request count)


---

# Definition of Done


## Core Behavior

From Request A, user can create Request B with prefilled fields and immediately link it:

- Create Request B (same tenant)
- Link:
  - fromRequestId = B
  - toRequestId   = A
  - linkType      = FULFILLS
- Emit RequestEvents:
  - `request.created`
  - `request.linked`
- Usage counters:
  - consume 1 request from monthly limit (J1 + J2)


---

## Authorization Rules

To create & link:

1. User must have access to Request A (C1)
AND
2. User must have permission to create requests:
   - `tenant.requests.create` (B1)
AND
3. User must have permission to link requests:
   - `tenant.requests.link` (G1)
   - OR Finance/Admin equivalent

If not authorized:

- return 403 (or 404 if Request A not visible)


---

## Prefill Rules

Request B should be prefilled based on Request A:

Minimum prefill (recommended):

- title: derived (e.g., "{A.title} — Fulfillment" or configurable)
- type: based on UI selection (default can be suggested)
- metadataJson: may carry a reference to A (optional)

Example metadata:

- sourceRequestId = A.id
- sourceLinkType = "FULFILLS"

Prefill must NOT copy sensitive evidence automatically unless explicitly required (default: do not copy evidence).


---

## Gating + Plan Limits (Aligned with J1 + J2)

The operation must respect plan request limits:

1. Resolve tenant plan:
   - `resolveTenantPlan(tenantId)` (J1)
2. Consume request monthly usage atomically:
   - `tryConsumeRequest(tenantId, yearMonth, maxRequestsPerMonth)` (J2)
   - If false → block:
     - "Upgrade required"
3. Create Request B
4. Create RequestLink (B → A, FULFILLS)
5. Emit RequestEvents:
   - `request.created`
   - `request.linked`
6. AuditLog entries (recommended):
   - `request.created`
   - `request.linked`
7. Commit transaction

Rules:

- If any step fails → rollback everything
- Usage counter must not increment if request/link not created (transaction rollback)


---

## Data Model Impact

Uses existing models:

- Request (B1)
- RequestLink (G1)
- TenantUsageMonthly (J2)
- RequestEvent (timeline)
- AuditLog (K1)


---

## Timeline / Events

Events to create:

1. `request.created` (for Request B)
   - metadata includes requestType, title, createdByUserId
2. `request.linked`
   - metadata includes linkType=FULFILLS, from=B, to=A

Optional:

- Add timeline entry also visible in Request A (mirror query display)


---

## UI Behavior

From Request A detail view:

- Action: “Create fulfillment request”
- Opens create form with prefilled fields
- On submit:
  - Request B is created
  - B is linked to A
  - User is redirected to Request B (recommended)

Visibility:

- Request B appears in “My Requests” list for creator
- Request A shows linked request B in its linked section (mirror view)


---

# Acceptance Criteria

- From a “PurchaseCommitment” request (A), user can create an “InvoicePayment” request (B) linked automatically
- Request B appears in creator’s “My Requests”
- Request A shows the linked request (B)
- Link is created as:
  - B → A (FULFILLS)
- Events are created:
  - `request.created`
  - `request.linked`
- Plan limits are respected:
  - consumes request count
  - if limit exceeded → blocked with "Upgrade required"


---

# Edge Cases

- Request A not visible to user:
  - return 404
- Linking across tenants:
  - impossible by design (validate tenantId)
- Duplicate link creation:
  - prevented by unique constraint (G1)
- Request A CLOSED:
  - Allowed (recommended) since this is linkage + new request creation
  - unless business rules forbid it (must be explicit)


---

# Concurrency Safety

- Usage consumption must be atomic (J2)
- Link creation must be protected by unique constraint (G1)
- Entire operation must be transactional:
  - consume + create + link + events


---

# Best Practices

- Keep this as a single transactional command
- Do not perform partial writes (no half-created request without link)
- Use canonical link semantics (FULFILLS is directional)
- Ensure UI prefill is only a suggestion; server is source of truth
- Keep audit trail complete (created + linked)


---

# Future Enhancements (Not v1)

- Prefill templates per RequestType
- Copy selected evidence to fulfillment request
- Multi-step fulfillment chains
- Auto-create based on status transitions
- Bulk fulfillment creation
