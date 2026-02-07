# H2 — Payment Evidence (Proof of Payment)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

- Attach proof of payment to a payable request
- Supported evidence types:
  - FILE
  - LINK
  - TEXT (manual note)
- Support versioning (append-only)
- Support soft remove (no hard delete)
- Provide “Paid missing proof” view


---

# Definition of Done


## Core Behavior

- A payment evidence record can be attached to a request
- Evidence types supported:
  - FILE (receipt screenshot, PDF, etc.)
  - LINK (external proof URL)
  - TEXT (manual confirmation note)
- Multiple evidence entries allowed (versioning via append-only)
- Evidence can be soft-removed
- RequestEvent emitted:
  - `request.payment.evidence.added`
  - `request.payment.evidence.removed`
- “Paid missing proof” view functions correctly


---

## Authorization Rules

To add or remove payment evidence, acting user must:

1. Have access to the request (C1)
AND
2. Have permission:
   - `tenant.payments.manage`
   - OR Finance/Admin equivalent

If not authorized:

- return 403 (or 404 if request not visible)


---

## Payable Validation

Before allowing evidence attachment:

- Validate request.type is payable (H1 logic)
- If not payable:
  - Block action
  - Return:
    - "Payment not supported"


---

## Data Model (Minimum)

### RequestPaymentEvidence

- id
- tenantId
- requestId
- evidenceType (FILE | LINK | TEXT)
- label (optional display name)
- contentText (nullable; for TEXT)
- url (nullable; for LINK)
- provider (nullable; for FILE)
- objectKey (nullable; for FILE)
- mime (nullable)
- size (nullable)
- sha256 (nullable)
- versionNumber (incremental per request)
- createdAt (UTC)
- createdByUserId
- removedAt (nullable)
- removedByUserId (nullable)

Constraints:

- versionNumber increments per request
- Only active evidence where removedAt IS NULL shown by default

Indexes:

- (tenantId, requestId, createdAt DESC)
- (tenantId, requestId, removedAt)


---

## Versioning Rules

- Each new evidence record increments versionNumber
- No overwriting existing evidence
- Soft remove does not decrement version
- Historical evidence remains queryable for audit


---

## Soft Remove Rules

When removing:

- Set removedAt (UTC)
- Set removedByUserId
- Do not physically delete row
- Emit:
  - `request.payment.evidence.removed`

Default queries:

- Exclude removedAt IS NOT NULL


---

## “Paid Missing Proof” View

Definition:

A request appears in “Paid missing proof” if:

- Payment status = PAID
AND
- No active payment evidence exists
  - (no RequestPaymentEvidence where removedAt IS NULL)

Behavior:

- When status set to PAID and no proof → appears in view
- When evidence added → disappears from view
- If all evidence removed while PAID → reappears


---

## Event Creation

### On Evidence Added

RequestEvent:

- `request.payment.evidence.added`

Metadata:

- requestId
- evidenceType
- versionNumber
- addedByUserId

### On Evidence Removed

RequestEvent:

- `request.payment.evidence.removed`

Metadata:

- requestId
- evidenceId
- removedByUserId


---

## Audit Logging (K1)

AuditLog entries (canonical action keys):

- `request.payment.evidence_added`
- `request.payment.evidence_removed`

Metadata:

- requestId
- evidenceType
- versionNumber
- actorUserId


---

# Acceptance Criteria

- Finance marks request as PAID and attaches screenshot (FILE)
- Evidence appears in request detail view
- RequestEvent created
- If request is PAID and has no evidence:
  - Appears in “Paid missing proof” view
- When evidence is attached:
  - Request disappears from that view
- Soft removal:
  - Evidence disappears from detail view
  - If no active evidence and status = PAID:
    - Request reappears in missing proof view


---

# Edge Cases

- Attach evidence to NOT_PAID:
  - Allowed (recommended)
  - Useful for pre-collection documentation
- Attach evidence to CLOSED request:
  - Allowed (recommended)
  - Since payment may occur after close
- Duplicate uploads:
  - Allowed (append-only)
- Large files:
  - Enforce max size
- Invalid URL for LINK:
  - Validation error


---

# Concurrency Safety

- VersionNumber increment must be atomic:
  - Calculate next version inside transaction
- Soft remove + event emission in same transaction
- No overwriting existing evidence rows


---

# Best Practices

- Keep payment evidence separate from general request evidence
- Use append-only model
- Use UTC timestamps
- Enforce tenant boundary validation
- Exclude soft-deleted rows by default
- Keep evidence storage references immutable


---

# Future Enhancements (Not v1)

- Require proof before allowing status = PAID
- Automatic validation rules (e.g., amount match)
- Partial payment proofs
- Approval of payment proof workflow
- Export proof bundle in ZIP
- Payment proof expiration policy
- Fraud detection flags
```
