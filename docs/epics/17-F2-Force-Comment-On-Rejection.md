# F2 — Force Comment on Rejection

## Scope

- Require a non-empty comment when an approval is rejected
- Applies to:
  - Internal approvals
  - External approvals (token-based)
- Ensure validation is enforced server-side (not UI-only)


---

# Definition of Done


## Core Behavior

When an approver performs REJECT:

- A comment is mandatory
- Comment must be non-empty and valid
- Comment is stored as part of:
  - RequestComment
  - RequestEvent
  - AuditLog (recommended)

If comment is missing or invalid:

- Action is blocked
- Clear error returned
- Participant status remains unchanged (PENDING)


---

## Validation Rules

On REJECT action:

- comment required
- comment must:
  - not be null
  - not be empty
  - not be whitespace-only
  - respect max length (e.g., 2000 chars)
- Validation must be enforced:
  - server-side
  - even if UI validation exists

Error example:

"Rejection comment is required"


---

## Integration with E2 (Internal Approval Action)

When internal approver rejects:

- participant.status → REJECTED
- respondedAt set
- RequestComment created with:
  - commentScope = APPROVAL
- RequestEvent created:
  - `request.rejected`
- Comment must be included in metadata

If comment missing:

- Reject action fails
- No status update
- No event created


---

## Integration with E3 (External Approval Action)

When external approver rejects via token:

- Same validation rules apply
- Token must be valid
- Comment required
- If missing:
  - action blocked
  - participant remains PENDING


---

## Data Model Impact

### RequestComment

No schema change required if already implemented in F1.

Comment on rejection:

- commentScope = APPROVAL
- May include flag:
  - isRejectionReason = true (optional but recommended)

Alternative approach:

- Add explicit field in RequestParticipant:
  - rejectionReason
  - (not recommended if comments already modeled cleanly)


---

## Timeline Behavior

- Rejection comment must appear in timeline
- It must be visually distinguished as:

  "Rejection Reason"

- Timeline entry includes:
  - author
  - date
  - comment content


---

## Export Behavior

- Rejection comment included in PDF export
- Should appear clearly labeled as:
  - Rejection Reason
- Must maintain chronological order


---

# Acceptance Criteria

- If an approver attempts to reject without comment:
  - Action blocked
  - Clear error returned
  - Participant status remains PENDING

- When rejection succeeds:
  - Comment is created
  - Timeline updated
  - RequestEvent created
  - Comment appears in export

- External rejection also requires comment
- Admin override (if exists) still requires comment


---

# Edge Cases

- Very short comment like "x":
  - Allowed unless minimum length rule defined
- Comment contains only spaces:
  - Rejected
- Double rejection attempt:
  - Already responded error (from E2/E3)
- Request CLOSED:
  - Rejection action blocked entirely


---

# Concurrency Safety

Rejection update must be atomic:

- Update participant only where:
  - status = PENDING
- If 0 rows affected:
  - Already responded or invalid state


---

# Best Practices

- Do not rely on UI validation alone
- Always validate server-side
- Keep rejection reason immutable
- Ensure rejection comment is stored before status transition commits
- Use consistent error messaging


---

# Future Enhancements (Not v1)

- Enforce minimum comment length
- Structured rejection reasons (dropdown + comment)
- Rejection categories
- Auto-notify creator on rejection with reason
- Analytics on rejection patterns
