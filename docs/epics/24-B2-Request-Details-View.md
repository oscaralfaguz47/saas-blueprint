# B2 — Request Details View

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

Build the request details endpoint/page that displays a complete request view, including:

- Request summary
- File attachments (D1)
- Evidence links (D2)
- Approvals (internal + external) (E1–E3)
- Timeline (events + comments) (K1, F1–F3)
- Linked requests (G1–G2)
- Payment section (if applicable) (H1–H2)


---

# Definition of Done


## Access Control (Critical)

- Must enforce access rules from **C1 — Request Access Rules**
- If user does not have access:
  - return 404 (recommended to avoid leaking existence)
  - or 403 (acceptable if you prefer explicit unauthorized)

Rules:

- Tenant boundary enforced
- Never expose any data from other tenants


---

## Data Returned (View Model)

The view must load a complete and consistent snapshot of:

### 1) Request Summary

- id
- title
- type
- status (OPEN/CLOSED)
- createdAt
- createdBy (display info)
- amount/currency (if present)
- metadata (safe subset for UI)

### 2) Evidence

- Files (D1): active only (deletedAt IS NULL)
- Links (D2): active only (deletedAt IS NULL)

### 3) Approvals

- Internal participants:
  - approver list with statuses (PENDING/APPROVED/REJECTED)
- External participants:
  - email + status
  - token state should NOT be exposed (only “link active” if needed)

### 4) Timeline

Chronological log combining:

- RequestEvents (created, linked, approval requested, approved/rejected, payment status set, reminder sent, etc.)
- Comments (F1) with scopes and critical flags (F2/F3)

Ordering:

- createdAt ASC (oldest → newest)

### 5) Linked Requests

- Active links only (removedAt IS NULL)
- Show both directions (mirror view via query):
  - where requestId is fromRequestId OR toRequestId

### 6) Payment (If Applicable)

Only if request type is payable (H1):

- Payment status (NOT_PAID/PENDING/PAID)
- Payment evidence list (H2)
- “Paid missing proof” indicator (computed)


---

## Consistency Requirements

- All sections are loaded from the same tenant-scoped requestId
- No partial data leaks:
  - linked requests must also be tenant-scoped
- View must load reliably even if some sections are empty:
  - no evidence → evidence section empty state
  - no approvals → approvals section empty state
  - no linked requests → empty state


---

## Performance Requirements

- Endpoint should not do N+1 queries
- Use a composed query strategy:
  - 1 query for request summary
  - 1 query per section (evidence, approvals, timeline, links, payment) OR optimized join strategy
- All queries must use indexes
- Timeline should be paginated if large (recommended)


---

## Security Rules

- Always validate:
  - tenantId matches request.tenantId
  - access check (C1) before loading sensitive sections
- Do not expose:
  - external tokens
  - internal permission structure
  - cross-tenant identifiers
- Apply output escaping for comments (XSS prevention)


---

# Acceptance Criteria

- If user does NOT have access to the request:
  - API returns 404/403 (based on chosen policy)
  - No data is returned

- If user DOES have access:
  - User sees Summary + Timeline + all relevant sections
  - View is complete and consistent
  - No data from other tenants is exposed


---

# Edge Cases

- Request is CLOSED:
  - Approve/reject actions blocked (E2/E3)
  - Reminder button hidden (E4)
  - Evidence add blocked if you adopted that rule (D1/D2)

- Large timeline:
  - Must paginate or limit to last N with “Load more”

- Linked request not accessible to user:
  - Must not show it unless user has access (recommended)
  - OR show redacted link entry (must be explicit if you choose this)

- Payment section for non-payable request:
  - Not shown
  - Payment actions return "Payment not supported" (H1/H2)


---

# Best Practices

- Use a dedicated RequestDetailsViewModel
- Keep access enforcement centralized (reuse canAccessRequest)
- Keep timeline standardized: all events share a common schema
- Use consistent empty states in UI
- Paginate timeline/events by cursor to scale
- Avoid loading raw metadata blobs unless needed


---

# Future Enhancements (Not v1)

- Real-time updates (WebSocket)
- Inline editing for summary fields with audit trail
- Evidence preview (images/PDF)
- Rich timeline filters (event type, actor)
- Activity analytics per request
