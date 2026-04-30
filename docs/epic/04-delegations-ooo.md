# Relitrue EPIC — Out-of-Office + Delegations

> **Version:** 1.0 — 2026-04-29  
> **Status:** Active  
> **Master Plan reference:** [00-master-plan.md](./00-master-plan.md), Decision D-004  
> **Depends on:** [01-access-model.md](./01-access-model.md), [02-finance-teams.md](./02-finance-teams.md), [03-assignment-engine.md](./03-assignment-engine.md)  
> **Used by:** [05-webhooks.md](./05-webhooks.md), [06-approval-routing.md](./06-approval-routing.md)  
> **Implementing Phase:** B (schema), C (delegation API), D (cron jobs + handoff logic)

## Section 1 — Purpose

Members go on vacation, sick leave, or temporary off-duty. Work must continue without blocking approvals or finance processing.

Without delegation, assignments pile up, approvals stall, and operations halt.

With delegation, a designated delegate temporarily receives scoped authority to act on the delegator's behalf.

Delegation is **scoped** (approvals only, finance only, or both) and **time-bounded** (start + end timestamps).

Explicit statements:

- Delegation does **not** transfer ownership — it grants temporary authority.
- Audit trail shows **both** the delegate (who acted) and the original assignee (on whose behalf).
- **HYBRID** handoff when delegation expires mid-work (D-004): `IN_PROGRESS` work stays with the delegate; `PENDING` work returns to the original assignee.
- A user **can** delegate to multiple delegates when scopes differ; **cannot** create circular delegations (A delegates to B while B delegates to A in a way that violates validation).

Interaction with doc 03 (assignment engine):

- Hard unavailability (`OUT_OF_OFFICE`, `ON_LEAVE`, `PAUSED`) excludes the member from eligible candidates unless delegation has moved finance work to a delegate.
- `AWAY` deprioritizes but does not necessarily exclude — exact ranking is engine policy (documented in assignment engine tuning).
- When an active delegation covers `FINANCE_ONLY` or `ALL`, finance assignments that would have targeted the delegator are routed to the delegate per engine rules.
- Approval delegation does not change `Record.financeAssignedMembershipId`; it uses participant-level delegation (Section 7–8).

Security and tenancy:

- All delegation and availability APIs resolve tenant from server-side membership; never trust client `tenantId`.
- Cross-tenant delegation is impossible by schema + API validation (delegator and delegate must share `tenantId` on their memberships).

## Section 2 — MembershipAvailability State Machine

```prisma
enum MembershipAvailability {
  AVAILABLE        // default — receives assignments + approvals
  AWAY             // soft unavailable (e.g., short break, end-of-day) — engine deprioritizes
  OUT_OF_OFFICE    // hard unavailable, vacation — engine excludes; delegations may activate
  ON_LEAVE         // extended unavailable, e.g. parental/medical — same as OOO but UI distinguishes
  PAUSED           // admin-set, e.g., disciplinary — same exclusion behavior, requires admin to resume
}
```

State transitions:

| From | To | Allowed by | Notes |
| --- | --- | --- | --- |
| AVAILABLE | AWAY, OUT_OF_OFFICE, ON_LEAVE | Self | Self-service via settings UI |
| AVAILABLE | PAUSED | ADMIN/OWNER | Cannot self-pause |
| AWAY | AVAILABLE | Self or auto (cron) | "AWAY" can have an `awayUntil` timestamp triggering auto-resume |
| OUT_OF_OFFICE | AVAILABLE | Self or auto (cron when window expires) | |
| ON_LEAVE | AVAILABLE | ADMIN/OWNER | Self cannot resume from ON_LEAVE — admin must approve return |
| PAUSED | AVAILABLE | ADMIN/OWNER | Admin only |

UI expectations (E phase, not exhaustive):

- Availability picker must explain impact on assignment engine and approvals.
- OOO / ON_LEAVE flows should surface delegation creation when scope would leave work blocked.
- Admin override screens must show previous vs new state and actor.

## Section 3 — TenantMembership Schema Updates

```prisma
model TenantMembership {
  // ... existing fields (4-axis from doc 01, finance counter from doc 02) ...
  
  // NEW: availability state
  availability         MembershipAvailability @default(AVAILABLE)
  availabilityReason   String? @db.VarChar(500)  // optional user-provided context
  
  // For AWAY / OUT_OF_OFFICE: optional auto-resume timestamp
  unavailableUntil     DateTime? @db.Timestamptz(6)
  
  // Delegations relationships
  delegationsGranted   ApprovalDelegation[] @relation("DelegationDelegator")
  delegationsReceived  ApprovalDelegation[] @relation("DelegationDelegate")
  
  @@index([tenantId, availability, unavailableUntil])  // for cron queries
}
```

The cron `delegation-activator` queries:

- Memberships where `availability = AVAILABLE` AND have a future-active delegation that should activate now.
- Memberships where `unavailableUntil <= now()` AND `availability != AVAILABLE` — auto-resume (subject to tenant config).

## Section 4 — ApprovalDelegation Model

```prisma
enum DelegationScope {
  ALL                  // both approvals AND finance work
  APPROVALS_ONLY       // approval responsibilities only
  FINANCE_ONLY         // finance work (assignments) only
}

enum DelegationStatus {
  SCHEDULED   // created but not yet active (startsAt > now)
  ACTIVE      // current
  EXPIRED     // endsAt has passed
  REVOKED     // manually canceled by delegator or admin
}

model ApprovalDelegation {
  id            String  @id @default(cuid())
  tenantId      String
  tenant        Tenant  @relation("TenantDelegations", fields: [tenantId], references: [id], onDelete: Cascade)
  
  // Delegator (the person going away)
  delegatorMembershipId String
  delegator             TenantMembership @relation("DelegationDelegator", fields: [delegatorMembershipId], references: [id], onDelete: Cascade)
  
  // Delegate (the recipient of authority)
  delegateMembershipId  String
  delegate              TenantMembership @relation("DelegationDelegate", fields: [delegateMembershipId], references: [id], onDelete: Cascade)
  
  scope         DelegationScope
  
  // Optional financial cap — only applies when scope includes FINANCE
  maxAmount     Decimal? @db.Decimal(20, 4)
  maxAmountCurrency String? @db.VarChar(3)
  
  // Time window
  startsAt      DateTime @db.Timestamptz(6)
  endsAt        DateTime @db.Timestamptz(6)
  
  // Status (managed by cron jobs)
  status        DelegationStatus @default(SCHEDULED)
  activatedAt   DateTime? @db.Timestamptz(6)
  deactivatedAt DateTime? @db.Timestamptz(6)
  
  reason        String? @db.VarChar(500)
  
  // Lifecycle
  createdAt       DateTime @default(now()) @db.Timestamptz(6)
  createdByUserId String?
  createdByUser   User?    @relation("DelegationCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  revokedAt       DateTime? @db.Timestamptz(6)
  revokedByUserId String?
  revokedByUser   User?    @relation("DelegationRevokedBy", fields: [revokedByUserId], references: [id], onDelete: SetNull)
  
  @@index([tenantId, status, startsAt, endsAt])  // for cron queries
  @@index([tenantId, delegatorMembershipId, status])
  @@index([tenantId, delegateMembershipId, status])
}
```

Validation:

- `delegatorMembershipId !== delegateMembershipId` (cannot self-delegate).
- `endsAt > startsAt`.
- `endsAt - startsAt <= maxDelegationWindow` (config: default 90 days).
- Delegate must have `status = ACTIVE` and compatible `financeResponsibility`.
- `maxAmount` only valid if scope ∈ { ALL, FINANCE_ONLY }.
- Cannot create overlapping delegations from same delegator with same scope.

## Section 5 — Delegation Lifecycle

State diagram:

```
SCHEDULED ──(cron: startsAt reached)──> ACTIVE
ACTIVE    ──(cron: endsAt reached)────> EXPIRED
SCHEDULED ──(manual: revoke)─────────> REVOKED
ACTIVE    ──(manual: revoke)─────────> REVOKED
```

Cron jobs:

#### `delegation-activator` (every 5 minutes)

- Query: delegations where `status = SCHEDULED AND startsAt <= now()`.
- For each: transition to ACTIVE, set `activatedAt = now()`, write audit + notification.
- Reassign existing PENDING work of delegator to delegate (per scope).
- Set delegator's `availability = OUT_OF_OFFICE` if not already set (configurable).

#### `delegation-deactivator` (every 5 minutes)

- Query: delegations where `status = ACTIVE AND endsAt <= now()`.
- For each: transition to EXPIRED, set `deactivatedAt = now()`.
- Apply HYBRID handoff (Section 6) for in-flight work.
- If no other active delegation: optionally restore delegator's availability (configurable per tenant).

Cron operational requirements:

- Jobs must be idempotent: the same delegation must not double-activate or double-expire if the job runs twice.
- Jobs must use short transactions per delegation batch to avoid long locks.
- Failed rows should retry with exponential backoff and emit `delegation.cron.failure` audit or metric (exact shape in observability phase).
- `delegation-activator` and `delegation-deactivator` should log counts: activated N, expired M, revoked K (no PII in logs).

## Section 6 — HYBRID Handoff Policy (D-004)

When delegation expires while the delegate has work `IN_PROGRESS`, tenant policy decides the outcome.

Configuration on TenantFinanceSettings:

```prisma
enum DelegationFinanceHandoffPolicy {
  HYBRID          // default: IN_PROGRESS stays with delegate; PENDING returns to delegator
  ALWAYS_REVERT   // ALL work returns to delegator regardless of state
  ALWAYS_KEEP     // ALL work stays with delegate (delegate owns it now)
}

model TenantFinanceSettings {
  id                                 String  @id @default(cuid())
  tenantId                           String  @unique
  tenant                             Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  
  delegationFinanceHandoffPolicy     DelegationFinanceHandoffPolicy @default(HYBRID)
  delegationApprovalHandoffPolicy    DelegationFinanceHandoffPolicy @default(HYBRID)  // separate for approvals
  
  // Other settings (added incrementally per phase)
  maxDelegationWindowDays            Int @default(90)
  
  createdAt DateTime @default(now()) @db.Timestamptz(6)
  updatedAt DateTime @updatedAt @db.Timestamptz(6)
}
```

HYBRID logic at delegation expiry:

```pseudocode
function applyHybridHandoff(delegation, tx) {
  policy = tx.tenantFinanceSettings.findUnique({ where: { tenantId: delegation.tenantId } })
  financePolicy = policy?.delegationFinanceHandoffPolicy ?? 'HYBRID'
  
  // Find all records currently assigned to delegate via this delegation
  recordsAssigned = tx.record.findMany({
    where: {
      tenantId: delegation.tenantId,
      financeAssignedMembershipId: delegation.delegateMembershipId,
      financeStatus: { in: ['ASSIGNED', 'IN_PROGRESS'] },
      // assignment was created during the delegation window
      financeAssignedAt: { gte: delegation.activatedAt, lte: delegation.deactivatedAt },
    }
  })
  
  for (record of recordsAssigned) {
    handoff = decide(record.financeStatus, financePolicy)
    
    if (handoff === 'REVERT') {
      // Reassign back to delegator
      tx.record.update({
        where: { id: record.id },
        data: { financeAssignedMembershipId: delegation.delegatorMembershipId }
      })
      tx.tenantMembership.update({
        where: { id: delegation.delegateMembershipId },
        data: { financeOpenAssignmentsCount: { decrement: 1 } }
      })
      tx.tenantMembership.update({
        where: { id: delegation.delegatorMembershipId },
        data: { financeOpenAssignmentsCount: { increment: 1 } }
      })
      tx.recordEvent.create({ eventType: 'FINANCE_REASSIGNED_VIA_DELEGATION_HANDOFF', ... })
    }
    // if KEEP: do nothing — delegate retains ownership
  }
}

function decide(status, policy) {
  if (policy === 'ALWAYS_REVERT') return 'REVERT'
  if (policy === 'ALWAYS_KEEP') return 'KEEP'
  // HYBRID
  if (status === 'IN_PROGRESS') return 'KEEP'
  return 'REVERT'
}
```

The same logic applies to approval delegations with separate `delegationApprovalHandoffPolicy`.

Implementation notes for finance handoff query:

- Prefer linking assignments to delegation via metadata or a dedicated column in a later migration if time-window filtering on `financeAssignedAt` is ambiguous; until then, engine should stamp `delegationId` on assignment events where feasible.
- Counter updates for REVERT paths must mirror doc 02 / doc 03: decrement delegate, increment delegator, in one transaction per record.
- If `activatedAt` is null (data bug), treat as no-op handoff and alert — do not partially reassign.

## Section 7 — Delegate Assignment Pattern

When a record needs an approver or processor and the assigned member has an active delegation:

**Approvals**

- `RecordParticipant` retains the original participant row; delegation links delegate actions without breaking `@@unique([recordId, userId, participantRole])`.
- `userId` remains the original assignee; delegate acts via delegation linkage (Section 8).
- Delegate sees the approval task in their work surface.
- Audit captures: approved by delegate on behalf of delegator.

**Finance assignments**

- `Record.financeAssignedMembershipId` updates to the delegate's membership while delegation covers finance scope.
- Original assignee is captured in audit log + `RecordEvent` metadata.
- When delegation expires and HYBRID returns work: `financeAssignedMembershipId` rolls back per policy.

Approval path detail:

- Delegate performs the approval action under authenticated session; server resolves effective authority via `delegatedViaDelegationId` and active `ApprovalDelegation` row.
- `delegatedToParticipantId` may point to a synthetic or linked participant row representing the delegate’s acting capacity — exact shape is implementation detail of doc 06; this doc requires audit to retain both actors.
- Revoking an active approval delegation mid-flight: use same handoff policy axis as `delegationApprovalHandoffPolicy` for pending approval steps.

## Section 8 — RecordParticipant Schema Updates

```prisma
model RecordParticipant {
  // ... existing fields ...
  
  // NEW: when set, this participant's actions are taken by the delegate
  delegatedToParticipantId String?
  delegatedTo              RecordParticipant? @relation("ParticipantDelegation", fields: [delegatedToParticipantId], references: [id], onDelete: SetNull)
  delegatedFrom            RecordParticipant[] @relation("ParticipantDelegation")
  
  // The delegation that created this link (for audit)
  delegatedViaDelegationId String?
  delegatedViaDelegation   ApprovalDelegation? @relation(fields: [delegatedViaDelegationId], references: [id], onDelete: SetNull)
}
```

Note: existing unique constraint `@@unique([recordId, userId, participantRole])` is preserved. The `delegatedToParticipantId` does not require a new unique constraint.

## Section 9 — API Contract

#### `GET /api/settings/availability`

Returns current user's availability + active delegations (incoming + outgoing).

#### `PATCH /api/settings/availability`

Self-service: update own availability state.

```ts
const updateAvailabilitySchema = z.object({
  availability: z.enum(['AVAILABLE', 'AWAY', 'OUT_OF_OFFICE', 'ON_LEAVE']),
  availabilityReason: z.string().max(500).optional(),
  unavailableUntil: z.string().datetime().optional(),
});
```

Constraints:

- Cannot self-set to PAUSED (admin only).
- Cannot self-resume from ON_LEAVE (admin only).
- If transitioning to OOO/ON_LEAVE, prompt user to create delegation (UI hint).

Audit log: `member.availability_changed`

#### `POST /api/settings/delegations`

Create a delegation.

```ts
const createDelegationSchema = z.object({
  delegateMembershipId: z.string().cuid(),
  scope: z.enum(['ALL', 'APPROVALS_ONLY', 'FINANCE_ONLY']),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  maxAmount: z.number().positive().optional(),
  maxAmountCurrency: z.string().length(3).optional(),
  reason: z.string().max(500).optional(),
});
```

Validation per Section 4. Audit log: `delegation.created`

#### `GET /api/settings/delegations`

List own delegations (granted + received) with optional status filter.

#### `DELETE /api/settings/delegations/[delegationId]`

Revoke a delegation. Sets status to REVOKED, applies handoff per Section 6 if status was ACTIVE.

Audit log: `delegation.revoked`

#### `POST /api/admin/members/[membershipId]/availability` (admin only)

ADMIN/OWNER override of any user's availability.

Used for: PAUSED state, returning a user from ON_LEAVE, force-resume.

Audit log: `member.availability_overridden_by_admin`

Suggested HTTP semantics (all endpoints: Zod-validated body, tenant-scoped, authenticated):

- `GET` availability / delegations: `200` with payload; `401` unauthenticated.
- `PATCH` availability: `200` success; `400` validation; `403` forbidden transition; `409` conflict with active policy.
- `POST` delegation: `201` created; `400` validation; `403` insufficient permission; `409` overlap or circular rule.
- `DELETE` delegation: `204` revoked; `404` not found in tenant; `403` not owner of delegation unless admin.

## Section 10 — Edge Cases

1. **Delegate becomes inactive**: cron `delegation-activator` skips activation; alerts admin; delegation moves to status `REVOKED` with reason `DELEGATE_INACTIVE`.
2. **Delegate also goes OOO**: delegate's own delegations don't auto-cascade; admin must intervene OR delegator's delegation is queued (status stays SCHEDULED).
3. **Circular delegation attempt**: A delegates to B who already delegates to A — REJECTED at create time (validation).
4. **Overlapping delegations same scope**: A creates delegation to B for scope=ALL Mon-Fri, then to C for scope=ALL Wed-Thu — REJECTED on create (overlapping windows same scope).
5. **Delegations don't stack**: only ONE active delegation per (delegator, scope) at a time.
6. **Delegate exceeds maxAmount cap**: when delegate tries to approve a record above `maxAmount`, request rejected with `DELEGATION_AMOUNT_EXCEEDED`.
7. **Delegation expires while delegate is mid-action**: delegate's in-flight HTTP request is allowed to complete (server-side check at action time) — UI may show stale state until refresh.
8. **Tenant downgrades from Enterprise during active delegation**: existing delegations remain; new ones blocked if delegations are plan-gated (TBD — not gated in v1).
9. **Delegator's availability auto-resume conflicts with active delegation**: delegation takes precedence; availability stays OOO until delegation expires.
10. **`unavailableUntil` set in the past**: cron immediately auto-resumes on next tick.
11. **Delegation revoked while it's pending activation**: simply transitions SCHEDULED → REVOKED; no handoff needed.
12. **Auto-resume disabled**: tenant config flag `disableAutoAvailabilityResume` keeps user in OOO state until manually changed.
13. **HYBRID policy with no in-flight work**: handoff is no-op; delegation simply EXPIRES.
14. **Delegate user deleted (cascade)**: ApprovalDelegation cascade-deletes; pending work is reassigned to delegator immediately.

## Section 11 — Notifications

| Event | Recipient | NotificationType |
| --- | --- | --- |
| Delegation created | Delegate | `DELEGATION_RECEIVED` |
| Delegation activated (cron) | Delegate + Delegator | `DELEGATION_ACTIVATED` |
| Delegation expired (cron) | Delegate + Delegator | `DELEGATION_EXPIRED` |
| Delegation revoked | Delegate | `DELEGATION_REVOKED` |
| Availability changed by admin | Affected member | `AVAILABILITY_OVERRIDDEN` |

These additions to `NotificationType` enum (extending the 7 from A5) are documented in Phase D when notifications service gets new types.

## Section 12 — Definition of Done for Delegations Implementation

- 5 new enums: `MembershipAvailability`, `DelegationScope`, `DelegationStatus`, `DelegationFinanceHandoffPolicy`
- 2 new models: `ApprovalDelegation`, `TenantFinanceSettings`
- TenantMembership new fields: `availability`, `availabilityReason`, `unavailableUntil`
- RecordParticipant new fields: `delegatedToParticipantId`, `delegatedViaDelegationId`
- 2 cron jobs: `delegation-activator`, `delegation-deactivator` (every 5 min)
- HYBRID handoff logic implemented + configurable per tenant (D-004)
- 6 API endpoints (Section 9)
- All 14 edge cases handled
- Notifications fired correctly (5 types from Section 11)
- Audit logs fired correctly
- Integration tests for cross-tenant delegation isolation (D-009): delegation in tenant A never affects tenant B's records

Verification checklist (non-exhaustive):

- Unit tests: `decide()` for all three policies × finance statuses.
- API tests: overlap detection, self-delegate, max window, max amount on approval.
- Cron tests: idempotent activate/deactivate with clock injection.
- Integration test: create delegation in tenant A, assert no `Record` or `ApprovalDelegation` leakage in tenant B.

## Section 13 — Changelog

```markdown
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-29 | Initial spec — availability + delegations + HYBRID handoff (D-004) |
```
