# Relitrue EPIC ù Auto-Assignment Engine

> **Version:** 1.0 ù 2026-04-29  
> **Status:** Active  
> **Master Plan reference:** [00-master-plan.md](./00-master-plan.md), Decisions D-003, D-006, D-007, D-009, D-010  
> **Depends on:** [01-access-model.md](./01-access-model.md), [02-finance-teams.md](./02-finance-teams.md)  
> **Used by:** [04-delegations-ooo.md](./04-delegations-ooo.md), [05-webhooks.md](./05-webhooks.md)  
> **Implementing Phase:** B (schema), C (engine + APIs)

## Section 1 ù Purpose

The Auto-Assignment Engine routes fully approved records to eligible finance processors.

It is the central automation layer that turns approval completion into operational execution.

Primary responsibilities:

- Trigger when a record reaches `approvalStatus = FULLY_APPROVED`.
- Receive hook signal from A4 reconciler via `RecordEvent.APPROVAL_FULLY_COMPLETED`.
- Evaluate configured `FinanceAssignmentRule` rows in priority order.
- Select the best member of the winning rule's team.
- Persist the assignment link on `Record.financeAssignedMembershipId`.
- Persist full evaluation snapshots in `FinanceAssignmentEvaluation` (D-003).
- Increment `TenantMembership.financeOpenAssignmentsCount` for winner (D-006).
- Emit record event and write audit log.
- Trigger webhook delivery pipeline (doc 05) when configured.

Candidate selection considers:

- availability state
- workload counters
- time zone context
- per-member weight
- strategy-specific rules

Normative guarantees:

- Deterministic for identical inputs and state.
- Idempotent for already assigned records.
- Plan-gated behind enterprise entitlement and feature flag.
- Fails closed if no candidate is valid.

Explicit statements:

- Same rules + same candidate set + same workload state = same winner.
- Re-run on already assigned record is a no-op returning existing assignment.
- Activation requires `FT_ASSIGNMENT_ENGINE_ENABLED` plus plan entitlement.
- No valid candidate means record remains unassigned with alert signal.


## Section 2 ù Triggering Events

The engine runs when ANY of these events occur:

| Event | Source | Notes |
| --- | --- | --- |
| `APPROVAL_FULLY_COMPLETED` | A4 reconciler `recomputeApprovalStatus` | Most common path |
| Manual trigger | API `POST /api/finance/assignments/[recordId]/trigger` | Admin reassignment / re-evaluation |
| Reassignment | API `POST /api/finance/assignments/[recordId]/reassign` | Drops current, runs full evaluation again |
| Member becomes unavailable | Phase D: delegation activated, OOO turned on | Reassigns OPEN records of that user (per delegation policy doc 04) |
| Cron `assignment-retry` | Phase D: nightly job | Retries records that failed assignment due to no candidates |

Trigger semantics:

- Trigger execution must be tenant-scoped and authenticated.
- Manual triggers are authorization hardened (OWNER/ADMIN only).
- Retry trigger is idempotent and bounded by retry policy.
- Availability-change trigger must respect delegation handoff rules.



## Section 3 ù FinanceAssignmentRule Model

```prisma
enum AssignmentRuleStatus {
  ACTIVE
  PAUSED
  ARCHIVED
}

enum AssignmentStrategy {
  ROUND_ROBIN              // weighted by FinanceTeamMember.weight
  LEAST_LOADED             // by financeOpenAssignmentsCount
  ROUND_ROBIN_THEN_LEAST   // round-robin in normal load; least-loaded when capped
  SPECIFIC_MEMBER          // always assign to one specific member (fallback team optional)
  TEAM_LEAD                // always assign to current isLead member of team
}

model FinanceAssignmentRule {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation("TenantAssignmentRules", fields: [tenantId], references: [id], onDelete: Cascade)
  
  name        String  @db.VarChar(120)
  description String? @db.VarChar(500)
  
  // Priority ù lower number = higher priority. Engine evaluates rules in ascending priority.
  priority    Int     @default(100)
  
  // Target finance team
  teamId      String
  team        FinanceTeam @relation(fields: [teamId], references: [id], onDelete: Restrict)
  
  // Strategy for selecting member within the team
  strategy    AssignmentStrategy @default(ROUND_ROBIN)
  
  // Optional: when strategy = SPECIFIC_MEMBER
  specificMembershipId String?
  
  // Status
  status      AssignmentRuleStatus @default(ACTIVE)
  
  // Lifecycle
  createdAt       DateTime  @default(now()) @db.Timestamptz(6)
  createdByUserId String?
  createdByUser   User?     @relation("FinanceAssignmentRuleCreatedBy", fields: [createdByUserId], references: [id], onDelete: SetNull)
  updatedAt       DateTime  @updatedAt @db.Timestamptz(6)
  deletedAt       DateTime? @db.Timestamptz(6)  // Soft delete (D-007)
  
  // Relations
  conditions      FinanceAssignmentRuleCondition[]
  evaluations     FinanceAssignmentEvaluation[]
  
  @@unique([tenantId, name])
  @@index([tenantId, status, priority, deletedAt])
  @@index([tenantId, teamId])
}
```

Rule behavior notes:

- Lower `priority` evaluates first.
- First matching rule wins.
- `PAUSED` and `ARCHIVED` rules are skipped.
- `deletedAt != null` rules are skipped by default.

Rule integrity constraints:

- Rule name uniqueness is tenant-local.
- API enforces case-insensitive uniqueness in addition to DB unique key.
- `SPECIFIC_MEMBER` requires `specificMembershipId` in same tenant and eligible scope.
- `TEAM_LEAD` requires at least one active lead candidate at evaluation time.


## Section 4 ù FinanceAssignmentRuleCondition Model

Conditions are AND'd together within a rule.

A rule MATCHES a record when ALL its conditions are satisfied.

```prisma
enum ConditionField {
  RECORD_TYPE                  // matches Record.type enum
  REQUESTED_AMOUNT             // numeric (with currency)
  CURRENCY_CODE                // string
  DEPARTMENT_ID                // string (TenantDepartment.id)
  COST_CENTER_ID               // string (TenantCostCenter.id)
  CREATED_BY_USER_ID           // string
  CREATED_BY_DEPARTMENT_ID     // string (creator's department)
  TAG                          // exists in record's tag list
  CUSTOM_FIELD                 // generic key/value match (extensibility)
}

enum ConditionOperator {
  EQUALS
  NOT_EQUALS
  IN                           // list of values (JSON array)
  NOT_IN
  GREATER_THAN
  LESS_THAN
  GREATER_THAN_OR_EQUAL
  LESS_THAN_OR_EQUAL
  BETWEEN                      // requires { min, max }
  IS_NULL
  IS_NOT_NULL
  CONTAINS                     // substring / list-contains
}

model FinanceAssignmentRuleCondition {
  id          String  @id @default(cuid())
  tenantId    String  // denormalized for tenant isolation
  
  ruleId      String
  rule        FinanceAssignmentRule @relation(fields: [ruleId], references: [id], onDelete: Cascade)
  
  field       ConditionField
  operator    ConditionOperator
  
  // Polymorphic value storage ù only one populated based on operator
  valueString String?  @db.VarChar(255)
  valueNumber Decimal? @db.Decimal(20, 4)
  valueJson   Json?    // for IN, NOT_IN, BETWEEN, CUSTOM_FIELD
  
  // Optional: scope when field = CUSTOM_FIELD
  customFieldKey String? @db.VarChar(120)
  
  // Lifecycle
  createdAt   DateTime @default(now()) @db.Timestamptz(6)
  deletedAt   DateTime? @db.Timestamptz(6)
  
  @@index([tenantId, ruleId, deletedAt])
}
```

Validation:

- API enforces that the right `value*` field is populated based on `operator`.
- `CUSTOM_FIELD` requires `customFieldKey`.
- `BETWEEN` requires `valueJson` of shape `{ min: number, max: number }`.
- `IN`/`NOT_IN` requires `valueJson` of shape `{ values: array }`.
- Numeric operators require `valueNumber`; string operators require `valueString`.

Condition evaluation notes:

- Missing record field values evaluate to `false` unless operator is null-check variant.
- Invalid condition payload is rejected at API layer before persistence.
- Condition coercion is explicit; no implicit numeric/string conversion.
- Currency-sensitive numeric checks require matching currency context.


## Section 5 ù FinanceAssignmentEvaluation Model (Audit Snapshot ù D-003)

This is the critical compliance feature.

Every assignment evaluation is captured for audit and debugging.

```prisma
enum EvaluationOutcome {
  ASSIGNED              // a member was selected and assigned
  NO_RULE_MATCHED       // no rule's conditions matched the record
  NO_CANDIDATES_AVAILABLE  // rule matched but team had no eligible members
  ENGINE_DISABLED       // feature flag off
  PLAN_NOT_ENTITLED     // tenant plan does not include assignment engine
  ERROR                 // unexpected error during evaluation
}

model FinanceAssignmentEvaluation {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation("TenantAssignmentEvaluations", fields: [tenantId], references: [id], onDelete: Cascade)
  
  recordId    String
  record      Record  @relation("RecordAssignmentEvaluations", fields: [recordId], references: [id], onDelete: Cascade)
  
  // Trigger context
  triggeredByEvent      String  @db.VarChar(80)  // e.g. "APPROVAL_FULLY_COMPLETED"
  triggeredByUserId     String?
  triggeredAt           DateTime @default(now()) @db.Timestamptz(6)
  
  // Outcome
  outcome               EvaluationOutcome
  matchedRuleId         String?  // FinanceAssignmentRule.id
  assignedMembershipId  String?  // TenantMembership.id (if outcome=ASSIGNED)
  
  // Snapshot data (immutable ù captures decision context)
  rulesEvaluated        Json     // array of { ruleId, ruleName, priority, matched: bool, conditionsResult: [...] }
  candidatesEvaluated   Json     // array of { membershipId, userName, weight, currentLoad, excluded: bool, exclusionReason: string|null }
  selectionStrategy     String?  @db.VarChar(40)  // strategy used in winning rule
  evaluationDurationMs  Int      @default(0)
  
  // Error capture
  errorMessage          String?  @db.VarChar(500)
  
  @@index([tenantId, recordId, triggeredAt])
  @@index([tenantId, outcome, triggeredAt])
  @@index([tenantId, matchedRuleId, triggeredAt])
}
```

Storage notes:

- One evaluation row per evaluation (NOT per assignment).
- Re-evaluations create new rows.
- `rulesEvaluated` and `candidatesEvaluated` are JSON snapshots.
- Rows are NEVER updated after creation.
- Retention follows audit log policy (`audit-log.mdc`).

Outcome semantics:

- `ASSIGNED`: includes winner and selected rule context.
- `NO_RULE_MATCHED`: rules snapshot populated, candidates may be empty.
- `NO_CANDIDATES_AVAILABLE`: matched rule captured, candidates snapshot required.
- `ENGINE_DISABLED`: no rule evaluation required.
- `PLAN_NOT_ENTITLED`: entitlement check failed before rule pass.
- `ERROR`: unexpected runtime condition captured with message.


## Section 6 ù Record Model Updates

The Record model gains assignment fields:

```prisma
enum FinanceStatus {
  NOT_REQUIRED        // record never needed finance processing
  PENDING_ASSIGNMENT  // waiting for engine to assign
  ASSIGNED            // member assigned, not yet started
  IN_PROGRESS         // member actively working
  COMPLETED           // finance work done
  CANCELED            // assignment voided (re-assigned or record closed)
  FAILED              // evaluation failed and exhausted retries
}

model Record {
  // ... existing fields ...
  
  // NEW: finance assignment denormalized
  financeStatus                FinanceStatus @default(NOT_REQUIRED)
  financeAssignedMembershipId  String?
  financeAssignedAt            DateTime? @db.Timestamptz(6)
  financeAssignedByRuleId      String?  // FinanceAssignmentRule.id
  
  // Relations
  financeAssignedMembership    TenantMembership? @relation("MembershipAssignedRecords", fields: [financeAssignedMembershipId], references: [id], onDelete: SetNull)
  financeAssignedByRule        FinanceAssignmentRule? @relation(fields: [financeAssignedByRuleId], references: [id], onDelete: SetNull)
  assignmentEvaluations        FinanceAssignmentEvaluation[] @relation("RecordAssignmentEvaluations")
  
  @@index([tenantId, financeStatus, financeAssignedAt])
  @@index([tenantId, financeAssignedMembershipId, financeStatus])  // for queue queries
}
```

`financeStatus` reconciler pattern:

- `recomputeFinanceStatus(tx, params)` is tx-aware and deterministic.
- Reconciler follows A4 style: pure function + persistence wrapper.
- Triggers include assignment creation, work start/complete, record close/cancel.
- Reconciler owns legal transition enforcement.

Status transition guidance:

- `PENDING_ASSIGNMENT -> ASSIGNED` on successful assignment.
- `ASSIGNED -> IN_PROGRESS` on queue start action.
- `IN_PROGRESS -> COMPLETED` on queue complete action.
- `ASSIGNED|IN_PROGRESS -> PENDING_ASSIGNMENT` on release or reassign reset.
- `* -> FAILED` only after bounded retries exhausted.


## Section 7 ù Engine Algorithm

Core engine pseudocode:

```pseudocode
function evaluateAndAssign(recordId, tenantId, triggerEvent, triggeredByUserId) {
  startTime = now()
  
  // 1. Plan gating + feature flag
  if (!isFeatureEnabled('FT_ASSIGNMENT_ENGINE_ENABLED', tenantId)) {
    return persistEvaluation(outcome=ENGINE_DISABLED, ...)
  }
  if (!tenantHasEnterpriseFeature(tenantId, 'AUTO_ASSIGNMENT')) {
    return persistEvaluation(outcome=PLAN_NOT_ENTITLED, ...)
  }
  
  // 2. Idempotency check
  record = tx.record.findUnique({ where: { id: recordId, tenantId } })
  if (record.financeAssignedMembershipId !== null) {
    return { outcome: 'ALREADY_ASSIGNED', existingMembershipId: record.financeAssignedMembershipId }
  }
  
  // 3. Load all active rules for tenant, ordered by priority ascending
  rules = tx.financeAssignmentRule.findMany({
    where: { tenantId, status: 'ACTIVE', deletedAt: null },
    orderBy: { priority: 'asc' },
    include: { conditions: { where: { deletedAt: null } } }
  })
  
  rulesEvaluated = []
  matchedRule = null
  
  for (rule of rules) {
    conditionResults = rule.conditions.map(c => evaluateCondition(c, record))
    matched = conditionResults.every(r => r.passed)
    rulesEvaluated.push({ ruleId, ruleName, priority, matched, conditionsResult: conditionResults })
    if (matched) {
      matchedRule = rule
      break  // first match wins
    }
  }
  
  if (!matchedRule) {
    return persistEvaluation(outcome=NO_RULE_MATCHED, rulesEvaluated, ...)
  }
  
  // 4. Load eligible candidates from matched rule's team
  candidates = tx.financeTeamMember.findMany({
    where: {
      teamId: matchedRule.teamId,
      deletedAt: null,
      membership: {
        status: 'ACTIVE',
        financeResponsibility: { in: ['PROCESS', 'PROCESS_AND_APPROVE'] },
        availability: 'AVAILABLE',  // see doc 04
      }
    },
    include: { membership: { select: { id, financeOpenAssignmentsCount, userId } } }
  })
  
  candidatesEvaluated = []
  eligibleCandidates = []
  
  for (candidate of candidates) {
    excluded = false
    exclusionReason = null
    
    // Check delegation: if member has active outgoing delegation, check if it covers FINANCE scope
    if (hasActiveOutgoingDelegation(candidate.membershipId, scope='FINANCE_ONLY' OR 'ALL')) {
      excluded = true
      exclusionReason = 'DELEGATED_OUT'
    }
    
    // Check workload cap
    teamCap = matchedRule.team.maxConcurrentAssignments ?? globalCap
    if (teamCap !== null && candidate.membership.financeOpenAssignmentsCount >= teamCap) {
      excluded = true
      exclusionReason = 'WORKLOAD_CAP_REACHED'
    }
    
    candidatesEvaluated.push({
      membershipId: candidate.membershipId,
      weight: candidate.weight,
      currentLoad: candidate.membership.financeOpenAssignmentsCount,
      excluded,
      exclusionReason,
    })
    
    if (!excluded) eligibleCandidates.push(candidate)
  }
  
  if (eligibleCandidates.length === 0) {
    return persistEvaluation(outcome=NO_CANDIDATES_AVAILABLE, ...)
  }
  
  // 5. Select winner using strategy
  winner = selectByStrategy(matchedRule.strategy, eligibleCandidates, matchedRule.specificMembershipId)
  
  // 6. Persist assignment in transaction
  await tx.record.update({
    where: { id: recordId, tenantId },
    data: {
      financeAssignedMembershipId: winner.membershipId,
      financeStatus: 'ASSIGNED',
      financeAssignedAt: now(),
      financeAssignedByRuleId: matchedRule.id,
    }
  })
  
  await tx.tenantMembership.update({
    where: { id: winner.membershipId },
    data: { financeOpenAssignmentsCount: { increment: 1 } }
  })
  
  await persistEvaluation(outcome=ASSIGNED, matchedRuleId=matchedRule.id, assignedMembershipId=winner.membershipId, ...)
  
  await tx.recordEvent.create({ eventType: 'FINANCE_ASSIGNED', metadata: { ruleId, membershipId, strategy } })
  await tx.auditLog.create({ action: 'record.finance.assigned', ... })
  
  // 7. Notify (create notification for assigned user)
  await createNotification({
    userId: winner.userId,
    type: 'RECORD_FINANCE_ASSIGNED',
    title: `New record assigned: ${record.title}`,
    entityType: 'Record',
    entityId: recordId,
    actionUrl: `/app/queue/${recordId}`,
    tx,
  })
  
  // 8. Webhooks (doc 05) ù fire-and-forget enqueue
  await enqueueWebhookDelivery({ event: 'record.finance.assigned', tenantId, payload: { ... } })
  
  return { outcome: 'ASSIGNED', membershipId: winner.membershipId, ruleId: matchedRule.id }
}
```


Strategy behavior details:

- `ROUND_ROBIN`: weighted deterministic pointer logic.
- `LEAST_LOADED`: minimum `financeOpenAssignmentsCount`, deterministic tie-break.
- `ROUND_ROBIN_THEN_LEAST`: weighted first; capacity pressure fallback.
- `SPECIFIC_MEMBER`: assign configured member if eligible; else no candidate outcome.
- `TEAM_LEAD`: choose active lead; deterministic if multiple leads.


## Section 8 ù Snapshot JSON Schemas

`rulesEvaluated` is an array of:

```typescript
type EvaluatedRuleSnapshot = {
  ruleId: string;
  ruleName: string;
  priority: number;
  matched: boolean;
  conditionsResult: Array<{
    conditionId: string;
    field: ConditionField;
    operator: ConditionOperator;
    expectedValue: string | number | object | null;
    actualValue: string | number | object | null;
    passed: boolean;
  }>;
};
```

`candidatesEvaluated` is an array of:

```typescript
type EvaluatedCandidateSnapshot = {
  membershipId: string;
  userName: string | null;       // captured at eval time (denormalized)
  userEmail: string | null;       // captured at eval time
  weight: number;
  currentLoad: number;            // financeOpenAssignmentsCount at eval time
  isLead: boolean;
  excluded: boolean;
  exclusionReason: 
    | null 
    | 'DELEGATED_OUT' 
    | 'WORKLOAD_CAP_REACHED' 
    | 'INACTIVE_MEMBERSHIP' 
    | 'AVAILABILITY_AWAY'
    | 'AVAILABILITY_OUT_OF_OFFICE'
    | 'AVAILABILITY_ON_LEAVE'
    | 'AVAILABILITY_PAUSED'
    | 'INSUFFICIENT_RESPONSIBILITY';
  selectedAsWinner: boolean;
};
```

Snapshot contract rules:

- Schema is append-only.
- Future additions must have backward-safe defaults.
- Never rename or remove existing fields.
- `selectedAsWinner` must be true for at most one candidate.

Snapshot size controls:

- `rulesEvaluated` capped at 100 with truncation marker.
- `candidatesEvaluated` capped at 200 with truncation marker.
- Truncation marker must include omitted count metadata.


## Section 9 ù Finance Queue (UI Backend)

The Finance Queue is the operational work UI for assigned members.

### `GET /api/finance/queue`

Returns records assigned to current user.

Query params:

- `status` ù filter by financeStatus (default: `ASSIGNED,IN_PROGRESS`)
- `cursor` ù pagination
- `limit` ù default 25, max 100

Visibility:

- User sees ONLY records where `financeAssignedMembershipId = my membership.id`.
- Records returned even if user does not have direct record access ù assignment grants implicit view.

### `POST /api/finance/queue/[recordId]/start`

Transitions `financeStatus: ASSIGNED ? IN_PROGRESS`.

Idempotent behavior:

- If already `IN_PROGRESS` by same assignee, return success no-op.
- If not assigned to caller, return forbidden.

### `POST /api/finance/queue/[recordId]/complete`

Transitions `financeStatus ? COMPLETED`.

Rules:

- Caller must be current assignee membership.
- Decrements workload counter transactionally.
- Triggers webhook event flow.

### `POST /api/finance/queue/[recordId]/release`

Member releases assignment back to pool.

Behavior:

- Resets `financeAssignedMembershipId = null`.
- Sets `financeStatus = PENDING_ASSIGNMENT`.
- Decrements counter for releasing assignee.
- Triggers engine re-evaluation.

### `POST /api/finance/assignments/[recordId]/reassign` (admin)

OWNER/ADMIN reassigns record.

Modes:

- Direct target mode with explicit `membershipId`.
- Evaluation mode (no target) to re-run engine.

Transactional guarantees:

- Decrement old assignee counter.
- Increment new assignee counter.
- Persist evaluation and event trail.

Queue endpoint security requirements:

- All endpoints require authenticated tenant membership.
- All actions validate tenant-local record ownership.
- Cross-tenant record IDs must return concealed not-found behavior.


## Section 10 ù Edge Cases

1. **Record assigned but member becomes inactive**
   - Counter is NOT auto-decremented.
   - Nightly reconciler detects and reassigns or alerts.

2. **Record approved but no rules configured**
   - Outcome `NO_RULE_MATCHED`.
   - Status remains `PENDING_ASSIGNMENT`.
   - Admin alert emitted.

3. **All candidates excluded**
   - Outcome `NO_CANDIDATES_AVAILABLE`.
   - Status remains `PENDING_ASSIGNMENT`.
   - Alert emitted.

4. **Concurrent re-evaluation race**
   - Use guard update `where: { id, financeAssignedMembershipId: null }`.
   - Secondary concurrent run becomes no-op safe failure.

5. **Rule deleted while evaluation in progress**
   - Snapshot preserves evaluated rule data.
   - In-progress evaluation outcome remains valid.

6. **Member deleted/soft-deleted with open assignments**
   - Counter drift can occur.
   - Nightly reconciler detects and reassigns.

7. **Tenant downgrades from Enterprise**
   - New evaluations return `PLAN_NOT_ENTITLED`.
   - Existing assignments preserved.

8. **Feature flag turned off mid-day**
   - New evaluations return `ENGINE_DISABLED`.
   - Existing assignments and queue actions continue.

9. **Numeric condition with mixed currencies**
   - Amount comparisons require currency-aware context.
   - Warn admin if amount rule omits explicit currency rule.

10. **Custom field missing on record**
    - Condition returns `passed: false`.
    - Rule fails gracefully without throw.

11. **Specific-member strategy with deleted member**
    - Outcome `NO_CANDIDATES_AVAILABLE`.
    - Alert emitted to admin.

12. **Reassignment loop**
    - If >3 reassignments in 1 hour for same record/member cycle, emit warning.

13. **Evaluation snapshot too large**
    - Cap `candidatesEvaluated` at 200.
    - Cap `rulesEvaluated` at 100.
    - Add truncation marker metadata.

14. **Engine called outside transaction**
    - Service enforces tx requirement.
    - Throws deterministic developer-facing error.


## Section 11 ù Performance Considerations

Target:

- < 500ms per evaluation for typical workloads (100 rules, 50 candidates).

Strategies:

- Indexed rule query on `(tenantId, status, priority, deletedAt)`.
- Single query include for conditions to avoid N+1.
- Use denormalized counter `financeOpenAssignmentsCount`.
- Persist snapshot in one create operation.

Pessimistic concerns:

- 1000+ rules per tenant can degrade evaluation time.
- 500+ candidates in one team can degrade candidate filtering.

Mitigations:

- Enforce plan-based caps on rules and team sizes.
- Encourage splitting large teams operationally.
- Keep condition evaluator pure and allocation-aware.
- Avoid loading unnecessary relation fields.

Execution model:

- Engine runs inline within transaction for consistency.
- Notification + webhook fanout runs post-commit and may enqueue background work.


## Section 12 ù Plan Gating + Limits

| Feature | Free Tier | Pro Tier | Enterprise Tier |
| --- | --- | --- | --- |
| Auto-Assignment Engine | ? | ? | ? |
| Max FinanceAssignmentRule per tenant | 0 | 0 | 100 |
| Max FinanceTeam per tenant | 1 (basic) | 5 | unlimited |
| Max members per FinanceTeam | 3 | 20 | unlimited |
| Assignment evaluations retention | n/a | n/a | 365 days |

Server-side enforcement:

- Every create/update API checks plan entitlement.
- Every rule/team/member creation checks current count against limits.
- Engine run path checks entitlement before evaluating rules.
- Downgraded tenants keep historical data but lose new auto-assignment execution.

Feature flag policy:

- `FT_ASSIGNMENT_ENGINE_ENABLED` required even for entitled tenants.
- Flag can be scoped per tenant using existing feature-flag tables.
- Flag-off state persists `ENGINE_DISABLED` outcomes for transparency.

## Section 13 ù Definition of Done for Engine Implementation

- 4 new models: `FinanceAssignmentRule`, `FinanceAssignmentRuleCondition`, `FinanceAssignmentEvaluation`, plus Record model updates.
- 4 new enums: `AssignmentRuleStatus`, `AssignmentStrategy`, `ConditionField`, `ConditionOperator`, `EvaluationOutcome`, `FinanceStatus`.
- Engine service in `src/server/services/finance/assignment-engine.ts` with pure-function condition evaluator.
- `recomputeFinanceStatus` reconciler in `src/server/services/finance/finance-status.ts` (pattern from A4).
- Hook from A4 reconciler: `APPROVAL_FULLY_COMPLETED` invokes assignment engine.
- 5 Finance Queue endpoints implemented (Section 9).
- Plan gating enforced (Section 12).
- Feature flag `FT_ASSIGNMENT_ENGINE_ENABLED` controls activation per tenant.
- Counter increment/decrement transactional (D-006).
- Nightly reconciler `reconcile-finance-counters` running (Phase D).
- Snapshot persisted with EVERY evaluation (D-003).
- Audit logs fired correctly (`record.finance.assigned`, `record.finance.reassigned`, `record.finance.released`).
- Notifications fired (`RECORD_FINANCE_ASSIGNED`).
- Integration tests for cross-tenant isolation (D-009): assignment in tenant A never assigns tenant B member.


## Section 14 ù Changelog

```markdown
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-29 | Initial spec ù engine + rules + conditions + snapshot + queue + plan gating |
```
