# F1 — Request Comments

## Scope

- Allow creating comments on a request
- Comment scope types:
  - GENERAL
  - APPROVAL
  - PAYMENT
- Comments are part of the audited record
- Comments appear in:
  - Timeline
  - PDF export


---

# Definition of Done


## Core Behavior

Every comment created must generate:

- A RequestComment record
- A RequestEvent:
  - `request.comment.added`

Comments are immutable once created (no edit/delete in v1).

Comments are included in:

- Request timeline (chronological order)
- PDF export (as part of audit trail)


---

## Authorization Rules

A comment can be created if:

1. User has access to the request (C1)
OR
2. External user has a valid approval token (E3, if enabled)

Internal users must:

- Have access to the request
- Have permission `tenant.requests.comment` (recommended)

External users:

- Must present valid token
- Token must not be expired or revoked
- Request must not be CLOSED


---

## Data Model (Minimum)

### RequestComment

- id
- tenantId
- requestId
- authorType (INTERNAL | EXTERNAL)
- authorUserId (nullable if EXTERNAL)
- authorEmail (snapshot required for EXTERNAL)
- commentScope (GENERAL | APPROVAL | PAYMENT)
- content (text)
- createdAt (UTC)

Indexes:

- (tenantId, requestId, createdAt ASC)
- (tenantId, requestId, commentScope)


---

## Comment Validation Rules

- content required
- max length enforced (e.g., 2000–5000 chars)
- no empty/whitespace-only comments
- sanitize output to prevent XSS (HTML escaped in UI)

Optional:

- strip dangerous HTML (recommended)
- disallow embedded scripts


---

## Closed Request Rule

If request.status = CLOSED:

- Default v1 behavior:
  - Block new comments
  - Return error: "Request is closed"

Alternative (must be explicit if enabled):

- Allow comments even if CLOSED (not default)


---

## RequestEvent

Create:

- `request.comment.added`

Metadata (recommended):

- requestId
- authorType
- authorUserId or authorEmail
- commentScope


---

## Audit Logging (K1)

Optional but recommended:

AuditLog entry:

- `request.comment.added`

Metadata:

- requestId
- authorType
- authorUserId/email
- commentScope


---

# Acceptance Criteria

- Internal user with access can add comment
- External user with valid token can add comment (if feature enabled)
- Comment appears in:
  - Timeline (chronological order by createdAt ASC)
  - PDF export
- Comments are displayed in correct order
- If request is CLOSED:
  - Comment creation is blocked
- Comment creation generates RequestEvent


---

# Edge Cases

- External token expired:
  - Cannot comment
- Very large comment:
  - Validation error
- Simultaneous comments:
  - Both succeed
  - Ordering based on createdAt timestamp
- Author deleted from tenant:
  - Comment remains (authorEmail snapshot preserved)


---

# Timeline Rules

- Comments appear in chronological order (oldest → newest)
- Timeline is append-only
- Comments are visually distinguished by scope (GENERAL / APPROVAL / PAYMENT)


---

# Export Rules

- Comments included in PDF export
- Include:
  - author
  - date (UTC or tenant timezone if implemented)
  - scope
  - content
- Respect access permissions (exporter must have request access)


---

# Best Practices

- Use UTC timestamps
- Escape content in frontend rendering
- Keep comments immutable in v1
- Snapshot author identity for audit consistency
- Avoid allowing HTML in v1 unless fully sanitized


---

# Future Enhancements (Not v1)

- Edit comment (with audit trail)
- Delete comment (soft delete with event)
- Mentions (@user)
- Attachments in comments
- Reactions (like/emoji)
- Rich text editor
