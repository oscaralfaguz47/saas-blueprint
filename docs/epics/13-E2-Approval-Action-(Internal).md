# E2 — Approval Action (Internal)

## Scope

- Allow internal approvers to:
  - Approve
  - Reject
  - Comment
- Only allowed if the user is an INTERNAL participant with:
  - participantRole = APPROVER
  - status = PENDING


---

# Definition of Done


## Core Behavior

An internal participant can perform one of the following actions:

- APPROVE
- REJECT
- COMMENT

Rules:

- User must be:
  - Linked to request as INTERNAL APPROVER
  - Status = PENDING
- Participant status updates accordingly:
  - APPROVE → status = APPROVED
  - REJECT → status = REJECTED
- COMMENT does not change approval status (optional behavior — recommended)

A RequestEvent is created for each action:

- `request.approved`
- `request.rejected`
- `request.commented`

AuditLog: use canonical action key per outcome — `request.approval.approved` or `request.approval.rejected` (comment-only does not change status)


---

## Authorization Rules

To perform approval action:

1. User must have access to the request (C1)
2. Must be a participant:
   - participantType = INTERNAL
   - participantRole = APPROVER
3. Participant status must be PENDING

If not:

- return 403 (or 404 if request not visible)


---

## State Transition Rules

Valid transitions:

- PENDING → APPROVED
- PENDING → REJECTED

Invalid transitions:

- APPROVED → APPROVED
- REJECTED → REJECTED
- APPROVED → REJECTED
- REJECTED → APPROVED

If participant already responded:

- Return 409 Conflict
- Message: "Already responded"

Exception (optional future):

- Admin override permission:
  - `tenant.approvals.override`
  - Allows second response


---

## Comment Rules

- Approve:
  - Comment NOT mandatory
- Reject:
  - Comment recommended (optional in v1 unless you enforce required)
- Comment-only action:
  - Does not modify approval status


---

## Closed Request Rule (Aligned with B3)

If request.status = CLOSED:

- All approval actions are blocked
- Return 400 or 409
- Message: "Request is closed"


---

## Data Model Impact

### RequestParticipant

Fields used:

- status
- respondedAt
- responseReason (optional)
- respondedByUserId (if needed for clarity)

Indexes:

- (tenantId, userId, status)
- (tenantId, requestId)


---

## Request Events

### On APPROVE

Event:

- `request.approved`

Metadata:

- requestId
- approverUserId
- comment (nullable)

### On REJECT

Event:

- `request.rejected`

Metadata:

- requestId
- approverUserId
- comment

### On COMMENT

Event:

- `request.commented`

Metadata:

- requestId
- authorUserId
- comment


---

## Audit Logging (K1)

AuditLog action (canonical per outcome):

- On APPROVE: `request.approval.approved`
- On REJECT: `request.approval.rejected`
- On COMMENT only: optional

Metadata:

- requestId
- approverUserId
- action (APPROVED | REJECTED | COMMENTED)
- comment (nullable)


---

# Acceptance Criteria

- Internal approver with PENDING status can approve
- After approval:
  - Participant status = APPROVED
  - respondedAt is set (UTC)
  - Event appears in timeline
  - AuditLog entry created

- If approver tries to approve twice:
  - Return 409
  - No state change

- If request is CLOSED:
  - Approval/rejection blocked
  - No state change
  - No counter or event created


---

# Edge Cases

- User removed from tenant:
  - Cannot perform approval
- Approver removed as participant before action:
  - Return 403
- Simultaneous double click (two rapid approvals):
  - Only one succeeds (use atomic update with predicate: status = PENDING)
- Comment very large:
  - Enforce max length (e.g., 2000 chars)


---

# Concurrency Safety

Approval update must be atomic:

- Update only where:
  - participant.status = PENDING
- Check affected rows:
  - If 1 → success
  - If 0 → already responded or invalid state


---

# Best Practices

- Use atomic predicate update (no read-modify-write in memory)
- Store respondedAt in UTC
- Snapshot approver email in event metadata
- Keep approval state independent from request.status
- Timeline events should be append-only


---

# Future Enhancements (Not v1)

- Sequential approval logic
- Parallel approval quorum logic
- Auto-approve rules
- SLA timers
- Approval delegation
- Mandatory rejection comment
