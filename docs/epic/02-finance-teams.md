# Relitrue EPIC — Finance Teams

> **Version:** 1.0 — 2026-04-29  
> **Status:** Active  
> **Master Plan reference:** [00-master-plan.md](./00-master-plan.md), Decision D-002, D-007  
> **Depends on:** [01-access-model.md](./01-access-model.md) — financeResponsibility axis  
> **Used by:** [03-assignment-engine.md](./03-assignment-engine.md) (assignment rules target Finance Teams)  
> **Implementing Phase:** B (schema), C (CRUD APIs)

## Section 1 — Purpose

Finance Teams define the processing side of the financial workflow domain.

They group users who execute operational finance work, including:

- assignment intake
- payment processing steps
- reconciliation work
- queue handling
- operational follow-up

Finance Teams are explicitly distinct from the approval domain.

- **Finance Teams** answer: who processes work?
- **Approval Routing Rules** answer: who authorizes work?

Approval authority is specified in `06-approval-routing.md` and should not be merged into team membership semantics.

Typical real-world team examples:

- `AP Team`
- `AR Team`
- `Treasury Team`
- `Department-X Finance Team`

Each team has core metadata and optional operational metadata:

- name
- description
- member list
- optional department association
- optional max workload cap
- optional time zone hints

The Auto-Assignment Engine evaluates teams and members to route records to eligible processors.

Normative statements:

- A user CAN belong to multiple teams.
- A team CAN have zero active members.
- Soft-deleted teams are preserved for audit trail (D-007).

Examples of multi-team membership:

- one user in both `AP Team` and `Vendor Onboarding Team`
- one user in `Treasury Team` and `Urgent Escalations Team`


## Section 2 — FinanceTeam Model

```prisma
model FinanceTeam {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation("TenantFinanceTeams", fields: [tenantId], references: [id], onDelete: Cascade)
  
  name        String  @db.VarChar(120)
  description String? @db.VarChar(500)
  
  // Optional department scope
  departmentId String?
  department   TenantDepartment? @relation("DepartmentFinanceTeams", fields: [departmentId], references: [id], onDelete: SetNull)
  
  // Operational status
  isActive    Boolean @default(true)
  
  // Optional team-level controls
  timeZone    String? @db.VarChar(64)        // IANA tz, e.g. "America/Los_Angeles"
  maxConcurrentAssignments Int?              // Per-member cap (overrides global)
  
  // Lifecycle
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  createdByUserId String?
  createdByUser   User?     @relation("FinanceTeamCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)
  deletedAt       DateTime? @db.Timestamptz(6)  // Soft delete (D-007)
  deletedByUserId String?
  deletedByUser   User?     @relation("FinanceTeamDeletedBy", fields: [deletedByUserId], references: [id], onDelete: SetNull)
  
  // Relations
  members         FinanceTeamMember[]
  assignmentRules FinanceAssignmentRule[]  // see doc 03
  
  @@unique([tenantId, name])  // unique team name per tenant
  @@index([tenantId, isActive, deletedAt])
  @@index([tenantId, departmentId])
}
```

Constraints:

- `name` is unique per tenant (case-insensitive comparison enforced at API layer).
- `deletedAt` set means soft-deleted; queries MUST filter by `deletedAt: null` unless explicitly fetching trash.
- Cascade behavior: tenant deletion cascades to teams; user deletion sets `createdBy`/`deletedBy` to null.


## Section 3 — FinanceTeamMember Model

```prisma
model FinanceTeamMember {
  id          String  @id @default(cuid())
  tenantId    String  // denormalized for tenant isolation queries
  
  teamId      String
  team        FinanceTeam @relation(fields: [teamId], references: [id], onDelete: Cascade)
  
  membershipId String   // FK to TenantMembership
  membership   TenantMembership @relation("MembershipFinanceTeams", fields: [membershipId], references: [id], onDelete: Cascade)
  
  // Optional per-member overrides
  weight      Int     @default(100)  // Round-robin weight (higher = more assignments)
  isLead      Boolean @default(false) // Team lead flag (UI / escalation hint)
  
  // Lifecycle
  joinedAt    DateTime  @default(now()) @db.Timestamptz(6)
  addedByUserId String?
  addedByUser   User?   @relation("FinanceTeamMemberAddedBy", fields: [addedByUserId], references: [id], onDelete: SetNull)
  deletedAt   DateTime? @db.Timestamptz(6)  // Soft delete (D-007)
  
  @@unique([teamId, membershipId])  // user can only be in a team once
  @@index([tenantId, teamId, deletedAt])
  @@index([tenantId, membershipId, deletedAt])  // for "what teams am I in?"
}
```

Constraints:

- `membershipId` MUST reference a TenantMembership with `financeResponsibility ? { PROCESS, PROCESS_AND_APPROVE }` — enforced at API layer.
- Cannot add a deactivated user (`TenantMembership.status !== 'ACTIVE'`) to a team.
- Soft-deleted members do NOT receive assignments.
- Each team should have = 1 lead — UI enforces, schema doesn't (allows transitional states).


## Section 4 — TenantMembership New Field

```prisma
model TenantMembership {
  // ... existing 4-axis fields from doc 01 ...
  
  // NEW: denormalized workload counter (D-006)
  financeOpenAssignmentsCount Int @default(0)
  
  // NEW: relation to teams
  financeTeams FinanceTeamMember[] @relation("MembershipFinanceTeams")
}
```

This counter:

- Incremented in transaction when an assignment is created and assigned to this user.
- Decremented in transaction when an assignment is closed/reassigned.
- Reconciled nightly by cron job (Phase D job: `reconcile-finance-counters`).
- Used by Assignment Engine to find least-loaded user (round robin with workload awareness).

Non-negotiable rule:

- The counter is an optimization, not source of truth.
- Assignment engine must still verify eligibility and live assignment state using direct tenant-scoped queries.


## Section 5 — Visibility Rules

Who can VIEW a Finance Team:

| User | Visibility |
| --- | --- |
| OWNER | All teams (active + soft-deleted) |
| ADMIN | All teams (active + soft-deleted) |
| MEMBER with financialAccess = ALL | Active teams only |
| MEMBER with financialAccess = DEPARTMENT | Teams where `team.departmentId IN user's departments`, OR teams the user is a member of |
| MEMBER with financialAccess = OWN_AND_PARTICIPATING | Only teams the user is a member of |
| MEMBER with financialAccess = NONE | Teams the user is a member of (still relevant for queue UI) |

Who can MANAGE (create/edit/delete) Finance Teams:

| User | Can Manage? |
| --- | --- |
| OWNER | ? Always |
| ADMIN | ? Always |
| MEMBER | ? Never |
| Platform Admin (vendor) | ? Never (use elevation flow) |

Who can MANAGE TEAM MEMBERS (add/remove members):

| User | Can Manage Members? |
| --- | --- |
| OWNER | ? Always |
| ADMIN | ? Always |
| MEMBER who is a `isLead = true` of that team | ? Only for THEIR team (configurable in v2) |
| MEMBER (regular member of team) | ? Cannot add/remove |
| Other MEMBER | ? Cannot |


## Section 6 — API Contract

### `GET /api/finance/teams`

List teams visible to current user. Filtered by visibility rules (Section 5).

Query params:

- `includeInactive=true` — include `isActive=false` teams (admin-only)
- `includeDeleted=true` — include soft-deleted teams (admin-only)
- `departmentId=...` — filter by department

Response:

```json
{
  "teams": [
    {
      "id": "...",
      "name": "AP Team",
      "description": "...",
      "departmentId": "...",
      "isActive": true,
      "memberCount": 5,
      "createdAt": "...",
      "deletedAt": null
    }
  ]
}
```

### `POST /api/finance/teams`

Create a team. Requires OWNER or ADMIN.

Request body:

```ts
const createTeamSchema = z.object({
  name: z.string().min(1).max(120).trim(),
  description: z.string().max(500).optional(),
  departmentId: z.string().cuid().optional(),
  timeZone: z.string().max(64).optional(),
  maxConcurrentAssignments: z.number().int().positive().optional(),
});
```

Audit log: `finance.team.created` with metadata `{ teamId, name, departmentId }`

Status codes:

- 201: created
- 400: validation error
- 403: not OWNER/ADMIN
- 409: name conflict in tenant

### `PATCH /api/finance/teams/[teamId]`

Partial update.

Same fields as POST (all optional). Cannot change `tenantId` or `id`.

Audit log: `finance.team.updated` with `{ changedFields, previousValues }`


### `DELETE /api/finance/teams/[teamId]`

Soft delete (sets `deletedAt`).

Constraints:

- Cannot delete a team with open assignments (must reassign first) — returns 409.
- Cannot delete the last team if `ApprovalRoutingRule` references it (must update rule first) — returns 409.

Audit log: `finance.team.deleted` with `{ teamId, name, hadActiveMembers, hadActiveRules }`


### `POST /api/finance/teams/[teamId]/members`

Add member to team.

Request body:

```ts
const addMemberSchema = z.object({
  membershipId: z.string().cuid(),
  weight: z.number().int().min(1).max(1000).default(100),
  isLead: z.boolean().default(false),
});
```

Validation:

- Membership MUST exist in same tenant.
- Membership MUST have `financeResponsibility ? { PROCESS, PROCESS_AND_APPROVE }`.
- Membership MUST be ACTIVE.
- User cannot already be in this team (returns 409 if duplicate).

Audit log: `finance.team.member.added` with `{ teamId, membershipId, weight, isLead }`


### `PATCH /api/finance/teams/[teamId]/members/[memberId]`

Update weight or lead status.

Audit log: `finance.team.member.updated`


### `DELETE /api/finance/teams/[teamId]/members/[memberId]`

Soft remove member.

Constraints:

- Cannot remove a member with open assignments (must reassign first).
- If member is the last lead, must promote another to lead first.

Audit log: `finance.team.member.removed`


## Section 7 — Edge Cases

1. **Team with zero active members**
   - Assignment Engine cannot assign.
   - Engine falls back to next rule or unassigned queue.

2. **Team referenced by an ApprovalRoutingRule when soft-deleted**
   - Rule becomes orphaned.
   - Cron job (`reconcile-finance-rules`) detects and alerts.

3. **User loses financeResponsibility while in teams**
   - Existing memberships are NOT auto-removed.
   - Reconciler in Phase D detects and alerts admin.

4. **Tenant deletion**
   - Cascades to teams + members + assignment rules (`onDelete: Cascade`).

5. **User deletion (`workspaceMembership.status = REMOVED`)**
   - Team membership soft-removed automatically.

6. **Department deletion**
   - Team `departmentId` is set to null (`SetNull`).
   - Team continues operating without department scope.

7. **Concurrent member add**
   - Prisma unique constraint catches race.
   - API maps to HTTP 409 with deterministic message.

8. **Soft-deleted team referenced in historical assignments**
   - Assignments keep historical reference.
   - UI displays `(deleted team)` badge.

9. **Workload counter drift**
   - Nightly reconciler re-counts and corrects drift in `financeOpenAssignmentsCount`.

10. **Team rename collision**
   - Rename to existing team name in same tenant returns 409.


## Section 8 — Counter Maintenance Strategy

The denormalized `financeOpenAssignmentsCount` field requires careful management.

**Increment trigger** (in transaction with assignment creation):

```pseudocode
tx.tenantMembership.update({
  where: { id: assignedMembershipId },
  data: { financeOpenAssignmentsCount: { increment: 1 } }
})
```

**Decrement trigger** (in transaction with assignment closure / reassignment):

```pseudocode
tx.tenantMembership.update({
  where: { id: previouslyAssignedMembershipId },
  data: { financeOpenAssignmentsCount: { decrement: 1 } }
})
```

**Nightly reconciler job** (`reconcile-finance-counters`):

1. For each tenant, query: `SELECT membershipId, COUNT(*) FROM Record WHERE financeAssignedMembershipId = ? AND status = 'OPEN' AND financeStatus IN ('ASSIGNED', 'IN_PROGRESS') GROUP BY membershipId`.
2. Compare to current `financeOpenAssignmentsCount`.
3. If drift detected: update + write audit log `finance.counter.reconciled` with `{ membershipId, expectedCount, actualCount, drift }`.
4. Alert if total drift > threshold.

Counter principles:

- Counter is a performance optimization for candidate ranking.
- Counter is never the source of truth for assignment eligibility.
- Engine must re-validate by direct tenant-scoped query before final assignment.


## Section 9 — Definition of Done for Finance Teams Implementation

- 2 new models in schema: `FinanceTeam`, `FinanceTeamMember`.
- `TenantMembership.financeOpenAssignmentsCount` field added.
- Soft delete fields working (`deletedAt`, `deletedByUserId`).
- 7 API endpoints implemented (Section 6).
- All Section 5 visibility rules enforced server-side.
- All Section 7 edge cases have explicit handling.
- Audit log actions fired correctly (8 actions per Section 6).
- Counter increment/decrement transactional (Section 8).
- Nightly reconciler job enqueued (Phase D delivers the runner).
- Integration tests for cross-tenant team isolation (1 test minimum, per D-009).


## Section 10 — Changelog

```markdown
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-29 | Initial spec — FinanceTeam + FinanceTeamMember + counter strategy |
```
