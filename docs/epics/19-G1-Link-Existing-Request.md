# G1 — Link Existing Request

## Scope

- Create relationships between existing requests within the same tenant
- Supported relationship types:
  - FULFILLS
  - RELATED
- Support soft remove (unlink without deleting history)
- Create timeline event when a link is created
- Enforce tenant boundary validation (same tenant)
- Prevent invalid “self-link” (from == to)


---

# Definition of Done


## Core Behavior

- A user can link Request B to Request A with a relationship type:
  - `FULFILLS` (B fulfills A)
  - `RELATED` (A and B are related)
- System creates a RequestLink record
- System emits RequestEvent:
  - `request.linked`
- Soft remove is supported:
  - link is not physically deleted
  - it is marked as removed
- Tenant boundary is enforced:
  - both requests must belong to the same tenant
- Prevent self-link:
  - cannot link a request to itself


---

## Authorization Rules

To create or remove a link, acting user must:

1. Have access to BOTH requests (C1)
AND
2. Have permission (recommended):
   - `tenant.requests.link`
   - OR Finance/Admin role equivalent

If not:

- return 403 (or 404 if request not visible; recommended: 404)


---

## Relationship Semantics

### FULFILLS

- Directional relationship:
  - `fromRequestId` = Request B
  - `toRequestId`   = Request A
Meaning:
- “B fulfills A”

### RELATED

- Non-directional relationship logically, but stored as a single row
- Use canonical ordering to avoid duplicates:
  - store smallerId as fromRequestId and largerId as toRequestId (recommended)
- Meaning:
- “A is related to B”


---

## Data Model (Minimum)

### RequestLink

- id
- tenantId
- linkType (FULFILLS | RELATED)
- fromRequestId
- toRequestId
- createdAt (UTC)
- createdByUserId
- removedAt (nullable)
- removedByUserId (nullable)

Constraints:

- fromRequestId != toRequestId
- Tenant boundary: both requests tenantId must match RequestLink.tenantId

Uniqueness (recommended):

- UNIQUE (tenantId, linkType, fromRequestId, toRequestId) WHERE removedAt IS NULL

Indexes:

- (tenantId, fromRequestId)
- (tenantId, toRequestId)
- (tenantId, createdAt DESC)


---

## Soft Remove Rules

Unlink action:

- sets removedAt (UTC)
- sets removedByUserId
- does not delete the row

Default list queries:

- only show links where removedAt IS NULL


---

## Timeline / Events

### RequestEvent: `request.linked`

Created when link is created successfully.

Recommended metadataJson:

- linkId
- linkType
- fromRequestId
- toRequestId

Optional:

- Emit `request.unlinked` on soft remove


---

## Mirror View (Optional)

If enabled:

- When viewing Request A, show links where:
  - A is fromRequestId OR toRequestId

This can be implemented by query union / OR filter.

No need to duplicate rows for reverse direction.


---

# Acceptance Criteria

- Finance (or user with permission) can link Request B to Request A as FULFILLS
- Link is tenant-scoped:
  - cannot link requests across tenants
- Self-link is blocked:
  - cannot link A → A
- Link creation emits RequestEvent `request.linked`
- Links are visible when viewing requests (mirror view by query, if enabled)


---

# Edge Cases

- Attempt to link requests across tenants:
  - blocked (404 or validation error)
- Attempt to create duplicate link:
  - idempotent success (recommended) or 409 conflict
- Attempt to unlink non-existent link:
  - 404
- Linking to CLOSED request:
  - allowed (recommended) since it is metadata-only
  - unless business rules forbid (must be explicit)


---

# Concurrency Safety

- Link creation must rely on unique constraint to prevent duplicates
- Use transaction to ensure:
  - link row + RequestEvent are consistent


---

# Best Practices

- Keep link model append-only with soft remove
- Use canonical ordering for RELATED to avoid duplicate rows
- Enforce access to both sides before linking
- Tenant boundary must be validated server-side
- Use clear semantics for directional vs non-directional links


---

# Future Enhancements (Not v1)

- Additional link types (DUPLICATE_OF, BLOCKED_BY, DEPENDS_ON)
- Link graph visualization
- Bulk linking UI
- Link-based reporting (e.g., fulfillment chain)
- Auto-suggest related requests by similarity
