# E3 — Approval Action (External Approvers)

## Scope

- Send email with secure token link for external approval
- Provide external read-only page with:
  - Approve
  - Reject
  - Comment
- Support token expiration and revocation
- No login required
- Protect system against abuse (basic app-level rate limiting)


---

# Definition of Done


## Core Behavior

- System generates a secure approval token for external approver
- Email sent with link containing token
- External page:
  - Read-only request view
  - Approve / Reject / Comment buttons
- Token supports:
  - Expiration
  - Revocation
- Approval state transitions correctly
- Timeline and audit entries are created
- Token is stored as HASH (never plain token in DB)
- Basic rate limiting applied at app level


---

## Data Model (Minimum)

### RequestParticipant (External)

Extends same participant model used for internal approvals.

Fields:

- id
- tenantId
- requestId
- participantType = EXTERNAL
- email
- status (PENDING | APPROVED | REJECTED)
- createdAt
- respondedAt (nullable)
- responseReason (nullable)

Indexes:

- (tenantId, requestId)
- (tenantId, email)


---

### ApprovalToken

Fields:

- id
- tenantId
- requestId
- participantId
- tokenHash
- expiresAt
- revokedAt (nullable)
- createdAt
- createdByUserId (nullable)
- lastUsedAt (nullable)

Constraints:

- UNIQUE (tokenHash)
- Index (tenantId, requestId)


---

## Token Security Rules

- Generate cryptographically secure random token
- Store only tokenHash (e.g., SHA-256)
- Never store plain token
- Token must be long enough (e.g., 256-bit entropy)
- Token included in email link

Validation process:

1. Hash incoming token
2. Lookup by tokenHash
3. Validate:
   - Not expired
   - Not revoked
   - Participant status = PENDING
   - Request.status != CLOSED


---

## Email Flow

When assigning external approver:

1. Create participant (status = PENDING)
2. Generate approval token
3. Store tokenHash
4. Send email with secure link
5. Emit RequestEvent:
   - `request.approval.link_opened` (optional on first visit)
6. AuditLog entry (canonical):
   - `request.approval.external_sent`


---

## External Page Behavior

External page:

- Shows request summary
- Shows evidence
- No edit capability
- No access to tenant data beyond scoped request

Actions available:

- Approve
- Reject
- Comment


---

## Approval Actions

On Approve:

- participant.status = APPROVED
- respondedAt set (UTC)
- Emit RequestEvent:
  - `request.approved`
- AuditLog entry

On Reject:

- participant.status = REJECTED
- respondedAt set
- Emit:
  - `request.rejected`
- AuditLog entry

On Comment:

- Emit:
  - `request.commented`
- Does not change approval status


---

## Closed Request Rule

If request.status = CLOSED:

- Token action is blocked
- Return error
- Do not modify state


---

## Token Expiry / Revocation

If:

- currentTime > expiresAt
- OR revokedAt != null

Then:

- Action blocked
- Return clear error:
  - "Link expired"
  - "Link revoked"


---

## Rate Limiting (Basic)

- Apply per-IP rate limit on token validation endpoint
- Example:
  - 10 attempts per minute
- Prevent brute-force token attacks


---

# Acceptance Criteria

- External user can approve without login
- Approval updates participant status correctly
- Token expired → action blocked
- Token revoked → action blocked
- Timeline updated correctly
- AuditLog entry created
- Token stored only as hash (never plain)
- Multiple rapid clicks:
  - Only first valid action succeeds
  - Subsequent attempts return error


---

# Concurrency Safety

Approval update must be atomic:

- Update only where:
  - participant.status = PENDING
- Check affected rows:
  - If 1 → success
  - If 0 → already responded or invalid

Token validation and participant update must occur within same transaction.


---

# Security Best Practices

- Never expose tenantId in URL beyond necessary
- Do not reveal request existence if token invalid
- Always validate tokenHash server-side
- Return generic error for invalid token
- Use HTTPS only
- No indexing of external approval pages


---

# Edge Cases

- Participant removed after email sent:
  - Token invalidated
- Token reused after approval:
  - Return error "Already responded"
- Request reassigned:
  - Old token revoked automatically (recommended)
- External email changed:
  - Token remains tied to participantId


---

# Timeline Events

Events to emit:

- `request.approval.link_opened`
- `request.approved`
- `request.rejected`
- `request.commented`


---

# Future Enhancements (Not v1)

- Magic link reissue
- Multi-step external approvals
- Approval reminder emails
- IP/device fingerprint logging
- Advanced rate limiting
- One-time token invalidation on first open
- Signed JWT tokens with short expiry
