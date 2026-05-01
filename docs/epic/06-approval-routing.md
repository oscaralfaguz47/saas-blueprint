# Relitrue EPIC — Approval Routing Rules

> **Version:** 1.0 — 2026-04-29  
> **Status:** Active  
> **Master Plan reference:** [00-master-plan.md](./00-master-plan.md), Decision D-002, D-007  
> **Depends on:** [01-access-model.md](./01-access-model.md), [03-assignment-engine.md](./03-assignment-engine.md)  
> **Related:** A4 reconciler — extends approval status logic with required-approver evaluation  
> **Implementing Phase:** B (schema), C (engine + APIs)

## Section 1 — Purpose

- Approval Routing Rules determine **who must approve** a record based on conditions (amount, vendor type, department, tags, custom fields, etc.).
- This domain is **distinct from Finance Assignment** (doc 03): assignment routes **who processes**; approval routing routes **who authorizes**.
- The same record may match **multiple** rules — they **stack**: all matched rules contribute required approvers (union, then deduped).
- Conditions reuse **`ConditionField`** + **`ConditionOperator`** enums from doc 03 for consistency and shared evaluation helpers.
- Rules can specify: required approver users, role-based pools, finance-team pools, sequential vs parallel evaluation, and escalation when an approver is unavailable.
- The **A4 reconciler** is extended to evaluate routing rules when a record reaches a triggering state and to interpret participant states including sequential blocking.

Explicit statements:

- Rules are **additive** — multiple matching rules combine their required approvers (deduped by effective approver identity).
- Rules are **soft-deletable** (D-007) for audit trail; historical evaluations and participants remain explainable.
- **Sequential** approval respects order; **parallel** approvals can complete in any order subject to `requireAll` semantics.
- Conditional approvals (e.g., “VP only if amount > $50K”) use the same condition model as assignment rules.

Non-goals for v1:

- `CREATOR_MANAGER` resolution (requires `User.managerId`) is stubbed for v2.
- Replacing all manual approver flows — default creator-assigned approvers remain the fallback.

Audit actions (cross-reference `00-master-plan.md` Section 8):

- `approval.routing_rule.created`, `approval.routing_rule.matched`, `approval.routing_rule.disabled`
- Re-evaluation should emit `approval.routing_rule.re_evaluated` (Section 9) with record and actor context.

## Section 2 — ApprovalRoutingRule Model

```prisma
enum ApprovalRoutingRuleStatus {
  ACTIVE
  PAUSED
  ARCHIVED
}

enum ApprovalRoutingMode {
  SEQUENTIAL  // approvers must approve in order; next is requested only after current approves
  PARALLEL    // all approvers requested simultaneously
}

enum ApprovalEscalationPolicy {
  NONE                 // no escalation; record waits indefinitely
  ESCALATE_AFTER_HOURS // escalate to escalation target after N hours pending
  AUTO_DELEGATE        // use delegation system (doc 04) if approver has active delegation
}

model ApprovalRoutingRule {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation("TenantApprovalRoutingRules", fields: [tenantId], references: [id], onDelete: Cascade)
  
  name        String  @db.VarChar(120)
  description String? @db.VarChar(500)
  priority    Int     @default(100)
  
  mode        ApprovalRoutingMode      @default(PARALLEL)
  status      ApprovalRoutingRuleStatus @default(ACTIVE)
  
  // Escalation
  escalationPolicy ApprovalEscalationPolicy @default(NONE)
  escalationHours  Int?  // when policy=ESCALATE_AFTER_HOURS
  escalationTargetMembershipId String?
  
  // Triggering: when to evaluate this rule
  triggerOnCreate         Boolean @default(true)   // evaluate when record submitted
  triggerOnAmountChange   Boolean @default(false)  // re-evaluate if amount edited
  
  // Lifecycle
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  createdByUserId String?
  createdByUser   User?     @relation("ApprovalRoutingRuleCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)
  deletedAt       DateTime? @db.Timestamptz(6)
  
  conditions      ApprovalRoutingRuleCondition[]
  requiredApprovers ApprovalRoutingRuleApprover[]
  evaluations     ApprovalRoutingEvaluation[]
  
  @@unique([tenantId, name])
  @@index([tenantId, status, priority, deletedAt])
}
```

Implementation notes:

- `priority` orders **condition evaluation** and snapshot ordering; **all** matched rules apply (unlike assignment first-match-wins).
- `PAUSED` / `ARCHIVED` rules are skipped by the engine.
- Escalation target membership must be same-tenant and validated at API layer.

## Section 3 — ApprovalRoutingRuleCondition Model

Same shape as `FinanceAssignmentRuleCondition` (doc 03 Section 4) — reuses `ConditionField` + `ConditionOperator` enums.

```prisma
model ApprovalRoutingRuleCondition {
  id          String  @id @default(cuid())
  tenantId    String
  
  ruleId      String
  rule        ApprovalRoutingRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  
  field       ConditionField    // shared enum from doc 03
  operator    ConditionOperator // shared enum from doc 03
  
  valueString String?  @db.VarChar(255)
  valueNumber Decimal? @db.Decimal(20, 4)
  valueJson   Json?
  customFieldKey String? @db.VarChar(120)
  
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  deletedAt   DateTime? @db.Timestamptz(6)
  
  @@index([tenantId, ruleId, deletedAt])
}
```

Validation: same as doc 03 Section 4 (operator/value shape, `CUSTOM_FIELD` key, `BETWEEN` / `IN` JSON shapes).

## Section 4 — ApprovalRoutingRuleApprover Model

Defines **who** approves when the rule matches.

```prisma
enum ApproverTargetType {
  SPECIFIC_USER       // exact user
  ROLE                // any user with given workspaceRole + financeResponsibility
  TEAM                // any active member of a FinanceTeam
  CREATOR_MANAGER     // creator's manager (requires User.managerId — future field, v2)
}

model ApprovalRoutingRuleApprover {
  id          String  @id @default(cuid())
  tenantId    String
  
  ruleId      String
  rule        ApprovalRoutingRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  
  // Sequential ordering (only used when rule.mode = SEQUENTIAL)
  sequenceOrder Int @default(1)
  
  // Target specification (polymorphic)
  targetType  ApproverTargetType
  targetMembershipId  String?  // when targetType=SPECIFIC_USER
  targetWorkspaceRole WorkspaceRole?  // when targetType=ROLE
  targetFinanceResponsibility FinanceResponsibility?  // when targetType=ROLE (combined filter)
  targetTeamId String?  // when targetType=TEAM
  
  // Optional: any approver from the target satisfies (otherwise ALL must approve)
  requireAll  Boolean @default(false)
  
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  deletedAt   DateTime? @db.Timestamptz(6)
  
  @@index([tenantId, ruleId, sequenceOrder, deletedAt])
}
```

Validation:

- Exactly one target field populated based on `targetType`.
- `requireAll` only meaningful when target resolves to multiple users (ROLE, TEAM).
- For `SPECIFIC_USER`: `requireAll` ignored.
- For `SEQUENTIAL` mode: `sequenceOrder` must be unique per rule (API + partial unique index if added in migration).

`pickOne` for non-`requireAll` ROLE/TEAM targets must be **deterministic** (documented tie-break: lowest `membershipId` lexicographic) to align with doc 03 determinism goals.

## Section 5 — ApprovalRoutingEvaluation Model (Audit Snapshot)

Same pattern as `FinanceAssignmentEvaluation` (doc 03 Section 5).

```prisma
enum ApprovalRoutingOutcome {
  APPROVERS_ASSIGNED      // 1+ rules matched, approvers added
  NO_RULE_MATCHED         // no rule matched; record uses default approval flow (creator-assigned)
  ERROR
}

model ApprovalRoutingEvaluation {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation("TenantApprovalRoutingEvaluations", fields: [tenantId], references: [id], onDelete: Cascade)
  
  recordId    String
  record      Record  @relation("RecordApprovalRoutingEvaluations", fields: [recordId], references: [id], onDelete: Cascade)
  
  triggeredByEvent  String   @db.VarChar(80)
  triggeredByUserId String?
  triggeredAt       DateTime @default(now()) @db.Timestamptz(6)
  
  outcome     ApprovalRoutingOutcome
  
  // Snapshot
  rulesEvaluated      Json   // array of { ruleId, ruleName, priority, matched, conditionsResult }
  approversAssigned   Json   // array of { ruleId, targetType, membershipId, sequenceOrder, participantId }
  evaluationDurationMs Int @default(0)
  
  errorMessage String? @db.VarChar(500)
  
  @@index([tenantId, recordId, triggeredAt])
  @@index([tenantId, outcome, triggeredAt])
}
```

Snapshot immutability:

- Rows are insert-only after creation.
- Truncation caps: `rulesEvaluated` at 100, `approversAssigned` at 200 (per Section 10).

## Section 6 — Engine Algorithm

Pseudocode for the routing engine:

```pseudocode
function evaluateApprovalRouting(recordId, tenantId, triggerEvent, tx) {
  startTime = now()
  
  record = tx.record.findUnique({ where: { id: recordId, tenantId } })
  
  // Load active rules for tenant, ordered by priority
  rules = tx.approvalRoutingRule.findMany({
    where: { tenantId, status: 'ACTIVE', deletedAt: null },
    orderBy: { priority: 'asc' },
    include: { 
      conditions: { where: { deletedAt: null } },
      requiredApprovers: { where: { deletedAt: null }, orderBy: { sequenceOrder: 'asc' } }
    }
  })
  
  rulesEvaluated = []
  matchedRules = []
  
  for (rule of rules) {
    conditionResults = rule.conditions.map(c => evaluateCondition(c, record))  // shared with doc 03
    matched = conditionResults.every(r => r.passed)
    rulesEvaluated.push({ ruleId, ruleName, priority, matched, conditionsResult: conditionResults })
    if (matched) matchedRules.push(rule)
    // NOTE: unlike Finance Assignment, ALL matching rules apply (not just first)
  }
  
  if (matchedRules.length === 0) {
    return persistEvaluation(outcome=NO_RULE_MATCHED, ...)
  }
  
  // Resolve target memberships per rule
  approversAssigned = []
  for (rule of matchedRules) {
    for (approver of rule.requiredApprovers) {
      candidates = resolveApproverTarget(approver, record, tx)
      // candidates: list of TenantMembership.id
      
      // Dedupe across rules (same user assigned by multiple rules = single participant)
      for (membershipId of candidates) {
        if (alreadyAssignedAsApprover(recordId, membershipId)) continue
        
        participantId = tx.recordParticipant.create({
          data: {
            tenantId,
            recordId,
            participantType: 'INTERNAL',
            participantRole: 'APPROVER',
            userId: getMembershipUserId(membershipId),
            status: rule.mode === 'SEQUENTIAL' && approver.sequenceOrder > 1 ? 'PENDING_BLOCKED' : 'PENDING',
            createdByUserId: triggeredByUserId,
          }
        })
        
        approversAssigned.push({ ruleId, targetType, membershipId, sequenceOrder: approver.sequenceOrder, participantId })
      }
    }
  }
  
  // Trigger A4 reconciler to recompute approvalStatus with new approvers
  await recomputeApprovalStatus(tx, { tenantId, recordId, triggeredByAction: 'ROUTING_RULES_APPLIED' })
  
  await persistEvaluation(outcome=APPROVERS_ASSIGNED, rulesEvaluated, approversAssigned, ...)
  await tx.auditLog.create({ action: 'approval.routing_rule.matched', metadata: { ruleIds: matchedRules.map(r => r.id) } })
  
  return { outcome: 'APPROVERS_ASSIGNED', count: approversAssigned.length }
}

function resolveApproverTarget(approver, record, tx) {
  switch (approver.targetType) {
    case 'SPECIFIC_USER':
      return [approver.targetMembershipId]
    case 'ROLE':
      members = tx.tenantMembership.findMany({
        where: {
          tenantId: record.tenantId,
          status: 'ACTIVE',
          workspaceRole: approver.targetWorkspaceRole,
          financeResponsibility: { in: ['APPROVE', 'PROCESS_AND_APPROVE'] }
        }
      })
      return approver.requireAll ? members.map(m => m.id) : [pickOne(members).id]
    case 'TEAM':
      teamMembers = tx.financeTeamMember.findMany({
        where: { teamId: approver.targetTeamId, deletedAt: null, membership: { status: 'ACTIVE' } }
      })
      return approver.requireAll ? teamMembers.map(m => m.membershipId) : [pickOne(teamMembers).membershipId]
    case 'CREATOR_MANAGER':
      // v2: requires User.managerId
      return []
  }
}
```

Engine invariants:

- Tenant isolation on every query (`tenantId` on record and all lookups).
- Creator-as-self-approver guard remains enforced at participant creation.
- Re-evaluation policy: **clear-routing-owned and re-evaluate** (revised v2). Manual approvers preserved. Already-responded routing approvers preserved (audit trail). Only PENDING/PENDING_BLOCKED routing-owned approvers are revoked before engine re-runs.

Dedup key:

- Dedupe by `(recordId, userId, APPROVER role)` or equivalent unique constraint preserved from current schema.

## Section 7 — Sequential vs Parallel Behavior

**PARALLEL mode:**

- All required approvers receive notification simultaneously (subject to `PENDING_BLOCKED` not applying).
- Any approval counts toward rule satisfaction according to `requireAll`:
  - `requireAll=false`: OR semantics within that approver row’s resolved set.
  - `requireAll=true`: AND semantics — all resolved memberships must approve.
- A4 reconciler computes `approvalStatus` based on combined participant state.

**SEQUENTIAL mode:**

- Approvers ordered by `sequenceOrder`.
- First approver receives notification immediately (`status = PENDING`).
- Subsequent approvers created with `status = PENDING_BLOCKED` (new enum value).
- When current approver approves, the next in sequence transitions `PENDING_BLOCKED → PENDING` and receives notification (service hook on approval action, not cron).
- Rejection at any sequential step rejects the entire chain per product policy.

**RecordParticipantStatus extension:**

```prisma
enum RecordParticipantStatus {
  PENDING
  APPROVED
  REJECTED
  PENDING_BLOCKED  // NEW: waiting for prior sequential approver
}
```

A4 reconciler updates:

- `PENDING_BLOCKED` participants are **excluded** from approval status calculation (not yet required).
- When unblocked, they count as `PENDING` toward completion thresholds.

## Section 8 — Triggering

The routing engine is invoked when:

| Event | Source |
| --- | --- |
| Record created (if `triggerOnCreate=true` for any active rule) | Record creation handler |
| Record amount edited (if `triggerOnAmountChange=true` for any active rule) | Record edit handler |
| Manual re-evaluation | API `POST /api/records/[recordId]/routing/evaluate` (admin) |

Ordering:

- Routing engine runs **before** or as a coordinated step with A4: it **adds** participants, then A4 computes `approvalStatus` from the full participant graph.

Concurrency:

- Record-level advisory lock or transaction serialization prevents double participant creation on concurrent edits (Section 10).

Interaction with webhooks (doc 05):

- After routing adds approvers and A4 reconciles, existing record events (e.g. `record.approval.requested`) may fire; no duplicate webhook-specific event is required for routing alone unless product adds `approval.routing_rule.matched` as a subscribed catalog entry in a future version.

## Section 9 — API Contract

#### `GET /api/admin/approval-routing-rules`

List rules. **ADMIN/OWNER** only.

#### `POST /api/admin/approval-routing-rules`

Create rule with conditions + approvers in single transactional payload.

```ts
const createRuleSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  priority: z.number().int().min(1).max(1000).default(100),
  mode: z.enum(['SEQUENTIAL', 'PARALLEL']),
  escalationPolicy: z.enum(['NONE', 'ESCALATE_AFTER_HOURS', 'AUTO_DELEGATE']).default('NONE'),
  escalationHours: z.number().int().positive().optional(),
  escalationTargetMembershipId: z.string().cuid().optional(),
  triggerOnCreate: z.boolean().default(true),
  triggerOnAmountChange: z.boolean().default(false),
  conditions: z.array(conditionSchema).min(1),
  requiredApprovers: z.array(approverSchema).min(1),
});
```

Audit log: `approval.routing_rule.created`

#### `PATCH /api/admin/approval-routing-rules/[ruleId]`

Update rule metadata. Conditions + approvers updated via separate sub-endpoints.

#### `DELETE /api/admin/approval-routing-rules/[ruleId]`

Soft delete. Records currently using the rule preserve their participants.

#### `POST /api/admin/approval-routing-rules/[ruleId]/conditions` + DELETE

Add/remove conditions.

#### `POST /api/admin/approval-routing-rules/[ruleId]/approvers` + DELETE

Add/remove required approver targets.

#### `GET /api/admin/approval-routing-rules/evaluations`

List evaluation history with filters.

#### `POST /api/records/[recordId]/routing/evaluate` (admin re-evaluation)

Manually trigger routing evaluation for a record. Useful when rules change.

Audit log: `approval.routing_rule.re_evaluated`

HTTP semantics (suggested):

- `401` / `403` for auth and role failures.
- `404` for concealed cross-tenant access.
- `409` for validation conflicts (duplicate name, invalid escalation config).

## Section 10 — Edge Cases

1. **No rule matches but record needs approval**: falls back to creator-assigned manual approvers (current behavior preserved).
2. **Multiple rules match with overlapping required approvers**: deduped — user assigned once; snapshot records contributing rule IDs.
3. **SEQUENTIAL with one approver**: behaves like single `PENDING` participant (no blocked chain).
4. **Approver inactive at evaluation time**: skipped with snapshot reason `INACTIVE_MEMBERSHIP`; if `requireAll=true` and no candidates remain, evaluation fails with alert.
5. **Approver has active delegation**: handled by doc 04 — delegation surfaces task to delegate without breaking unique participant constraint.
6. **Rule deleted while record has assigned participants**: participants preserved; flow continues.
7. **Condition references CUSTOM_FIELD that doesn't exist on record**: condition fails (`passed=false`), rule doesn't match.
8. **Sequential chain with rejection mid-way**: subsequent `PENDING_BLOCKED` participants remain blocked; A4 sets terminal rejected state for record.
9. **Concurrent record edits triggering re-evaluation**: serialized via record-level lock; second evaluation runs after first completes.
10. **Re-evaluation removes existing approvers (revised v2)**: Re-evaluation REVOKES routing-owned PENDING/PENDING_BLOCKED approvers, preserves manual approvers (those with `routingRuleId IS NULL`), and preserves already-responded routing approvers (status APPROVED or REJECTED). Engine then re-runs to assign new approvers based on current rules.
11. **`escalationPolicy=ESCALATE_AFTER_HOURS` with no escalationTarget**: validation rejects at create time.
12. **Circular creator→approver = creator**: rejected at participant create (existing product rule).
13. **Plan downgrade with active rules**: rules continue working for in-flight records; creating new rules may be blocked per plan (TBD); v1 baseline: Pro+ as per Section 11.
14. **Snapshot truncation**: `rulesEvaluated` capped at 100, `approversAssigned` capped at 200 with truncation metadata.

### Re-evaluation policy revision (v2 — supersedes add-only policy)

**Original policy (deprecated):** Add-only — re-evaluation never removes existing approvers, only adds new ones based on rule matching.

**Revised policy (current):** Clear-routing-owned-and-re-evaluate.

**Rationale for revision:**

The original add-only policy was specified before C13a/C13b implementation. During C14 implementation planning, two blocking issues emerged:

1. **Technical blocker:** The `evaluateAndAssign` engine has an `EXISTING_APPROVERS` early-return guard that skips evaluation if ANY active APPROVER exists on the record. Add-only mode would mean re-evaluation always skips → endpoint provides no value.

2. **UX problem (approver accumulation):** Add-only causes approver lists to grow indefinitely as rules change. Real-world scenario: admin changes rule from "CFO + CEO" to "CFO + Board" — record ends up with three approvers (CFO + CEO + Board), creating a broken workflow that requires manual revocation of old approvers.

**Revised policy details:**

When re-evaluation is triggered (admin via `POST /api/records/[recordId]/routing/evaluate`):

- **Routing-owned approvers in PENDING/PENDING_BLOCKED status:** REVOKED (set `revokedAt = now()`)
- **Routing-owned approvers in APPROVED/REJECTED status:** PRESERVED (audit trail of past decisions)
- **Manual approvers (`routingRuleId IS NULL`):** PRESERVED (admin's deliberate additions, not engine-managed)
- **Engine then re-runs** with `triggerEvent: ADMIN_MANUAL_REEVALUATION`
- **Engine bypasses `EXISTING_APPROVERS` check** when triggered with `ADMIN_MANUAL_REEVALUATION` (the clear phase already handled it)
- **Engine `EXISTING_APPROVERS` check is also refined globally** to only count `routingRuleId IS NOT NULL` rows (semantic fix — engine should only care about routing-owned state)

**State preservation guarantees:**

- Past approval/rejection decisions never lost
- Manual approver workflows untouched
- Audit log records the clear operation separately from the engine re-evaluation
- Notifications fire for newly assigned approvers (engine post-tx pattern from C13a)
- A4 reconciler maintains correct `Record.approvalStatus` throughout

**This change supersedes Section 10 line items referencing add-only policy.**

## Section 11 — Plan Gating

| Feature | Free | Pro | Enterprise |
| --- | --- | --- | --- |
| Approval Routing Rules | ❌ | ✅ (max 5) | ✅ (max 100) |
| Sequential mode | ❌ | ❌ | ✅ |
| Escalation | ❌ | ❌ | ✅ |
| CUSTOM_FIELD conditions | ❌ | ❌ | ✅ |

NOTE: unlike Finance Assignment Engine (Enterprise-only), basic Approval Routing is available to Pro tier as a competitive must-have.

Enforcement:

- API checks plan before create/update of gated features (sequential, escalation, custom field conditions).
- Engine skips gated rule features when reading legacy data — prefer validation at write time to avoid ambiguous runtime behavior.

## Section 12 — Definition of Done

- 4 new models: `ApprovalRoutingRule`, `ApprovalRoutingRuleCondition`, `ApprovalRoutingRuleApprover`, `ApprovalRoutingEvaluation`
- 4 new enums + 1 enum extension (`PENDING_BLOCKED` added to `RecordParticipantStatus`)
- Engine in `src/server/services/approvals/routing-engine.ts` (pure conditions reused from doc 03)
- A4 reconciler updated to handle `PENDING_BLOCKED` exclusion
- 8 API endpoints (Section 9)
- Plan gating enforced (Section 11)
- All 14 edge cases handled
- Audit logs fired correctly
- Snapshot persisted with every evaluation
- Integration tests for cross-tenant routing isolation (D-009)
- Sequential mode triggers next approver via service hook (not cron)

Verification checklist:

- Unit tests: condition evaluation parity with assignment rule tests where shared.
- API tests: plan gates, dedupe, admin re-evaluation (clear-routing-owned, v2 policy).
- Integration tests: sequential unblock on approve action.

## Section 13 — Changelog

```markdown
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-29 | Initial spec — routing rules + conditions + approvers + sequential mode |
```
