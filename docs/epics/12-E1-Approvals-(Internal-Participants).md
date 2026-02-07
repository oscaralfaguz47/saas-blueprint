# E1 — Approvals (Internal Participants)

## Scope

- Add an internal participant (tenant membership/user) as an approver to a request
- Track approval status:
  - PENDING
  - APPROVED
  - REJECTED
- Ensure the approver sees the request in a Pending inbox view


---

# Definition of Done


## Core Behavior

- A privileged user can assign an internal approver to a request
- System creates an internal participant record with:
  - status = PENDING
- System emits a RequestEvent:
  - `request.approval.requested`
- System prevents duplicate internal approvers for the same request


---

## Authorization Rules

To assign an internal approver, the acting user must:

1. Have access to the request (C1)
AND
2. Have permission to assign internal approvers, for example:
   - `tenant.approvals.assign_internal`
   - OR Finance/Admin role equivalent

(Exact permission key should match your roles/permissions EPIC.)


---

## Data Model (Minimum)

### RequestParticipant (Internal)

Represents internal people linked to a request.

Fields:

- id
- tenantId
- requestId
- userId (internal user)
- participantType = INTERNAL
- participantRole = APPROVER
- status (PENDING | APPROVED | REJECTED)
- createdAt
- createdByUserId
- respondedAt (nullable)
- responseReason (nullable)

Constraints:

- UNIQUE (requestId, userId, participantRole)  *(prevents duplicate internal approver)*
- Index: (tenantId, userId, status, createdAt DESC) *(for inbox/pending view)*
- Index: (tenantId, requestId, createdAt DESC)


---

## Request Event

### RequestEvent: `request.approval.requested`

Created on successful assignment.

Recommended metadataJson:

- requestId
- approverUserId
- approverEmail (snapshot recommended)
- assignedByUserId
- assignedByRole (optional)


---

## Assignment Rules

When assigning an internal approver:

- Create participant row if it does not exist
- If participant already exists for same request + user + APPROVER:
  - return conflict (409) OR treat as idempotent (recommended)

Default behavior (recommended):

- Idempotent success (no duplicates, no errors to user)


---

## Pending Inbox Behavior

Internal user can see requests needing their action:

Pending Inbox query rules:

- tenantId = current tenant
- participantRole = APPROVER
- status = PENDING
- userId = current user

Sorted by:

- createdAt DESC


---

## Audit Logging (K1)

Create AuditLog entry (canonical action key):

- `request.approval.internal_assigned`

Recommended metadataJson:

- requestId
- approverUserId
- assignedByUserId


---

# Acceptance Criteria

- Finance/Creator (with correct permission) can assign an internal approver
- The assigned approver appears as participant with:
  - status = PENDING
- Duplicate internal approver for same request is not allowed
- The approver sees the request in Pending Inbox
- RequestEvent `request.approval.requested` is created


---

# Edge Cases

- Assign internal approver to CLOSED request:
  - block with "Request is closed"

- Assign user not in tenant:
  - validation error

- Assign yourself:
  - allowed (if business rules permit) or blocked (must be explicit)
  - default: allowed

- User removed from tenant after assignment:
  - participant remains for history
  - inbox should not show it to removed user


---

# Best Practices

- Enforce uniqueness at DB level (unique constraint)
- Keep participant status transitions strict
- Use UTC timestamps
- Snapshot email/name into metadata for audit readability
- Keep inbox query indexed and efficient


---

# Future Enhancements (Not v1)

- Multiple internal approvers with ordering
- Parallel approvals vs sequential approvals
- SLA reminders / nudges
- Approval delegation
- Approver comments and attachments
