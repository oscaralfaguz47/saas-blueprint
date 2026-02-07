# J2 — Monthly Usage Counters (Hard-Limit Safe)

## Scope

- Implement TenantUsageMonthly (requestsCreated, exportsGenerated)
- Guarantee **hard-limit correctness** under concurrency (no overshoot)
- Ensure atomic increments at the database level
- Prevent race conditions (no lost updates, no duplicate month rows)
- Provide a clean counter “engine” that J1 gating can call


---

# Definition of Done


## Data Model

Table: TenantUsageMonthly

Columns:

- tenantId (FK)
- yearMonth (INT, e.g. 202602)
- requestsCreated (INT, default 0)
- exportsGenerated (INT, default 0)
- createdAt
- updatedAt

Constraints:

- UNIQUE (tenantId, yearMonth)
- Index: (tenantId, yearMonth)


---

## YearMonth Standard

Use integer format:

- 202602 = Feb 2026

Rules:

- Derived from server time standard (UTC recommended)
- All usage is scoped by (tenantId, yearMonth)


---

## Counter Engine Contract (No Plan Logic Inside)

J2 must NOT decide plan, features, or limits.

J2 only exposes atomic operations like:

- tryConsumeRequest(tenantId, yearMonth, maxRequestsPerMonth)
- tryConsumeExport(tenantId, yearMonth, maxExportsPerMonth)

Where:

- max* comes from `resolveTenantPlan(tenantId)` (J1)
- J2 only enforces “consume 1 unit if below max”


---

## Hard-Limit Safe Atomic Consume

### Requirement

Must be impossible for counters to exceed the plan limit even with concurrent requests.

No:

- read → validate → increment (not safe under concurrency)

Yes:

- single atomic DB statement that both checks and increments


---

## Atomic Consume Pattern (Recommended)

### A) Ensure row exists (idempotent)

- Create row for (tenantId, yearMonth) if missing
- Must be safe under concurrency (unique constraint)

### B) Consume with atomic check

For requests:

- Increment requestsCreated only if requestsCreated < maxRequestsPerMonth

For exports:

- Increment exportsGenerated only if exportsGenerated < maxExportsPerMonth


---

## Success / Failure Semantics

### On success

- Exactly +1 is applied
- Operation returns success = true
- Counter value is guaranteed <= max limit

### On limit exceeded

- No increment is applied
- Operation returns success = false
- Caller returns error message:

"Upgrade required"

### On action failure

- J2 consume MUST be called only after the action is validated
- If you need “consume then do action”, it must be in one transaction (caller-owned) with rollback capability


---

## Transaction + Ordering Rule (Aligned with J1)

To align with J1:

- Plan resolution + feature gating happens first (J1)
- Counter consumption happens as part of the same “action pipeline”
- Counters must only reflect successful actions

Recommended sequence:

1. J1: resolveTenantPlan(tenantId)
2. J1: validate feature flag (e.g., exportZip enabled)
3. J2: tryConsume*(..., limit)
   - if false → block with "Upgrade required"
4. Execute action
5. Commit

If step 4 fails → entire transaction rolls back → counter stays unchanged


---

## Concurrency Guarantees

Must guarantee:

- No overshoot above limit
- No double rows per (tenantId, yearMonth)
- No lost updates

Implementation must rely on:

- UNIQUE (tenantId, yearMonth)
- Atomic UPDATE with a predicate (counter < limit)


---

# Acceptance Criteria


## Hard Limit Under Concurrency

Given:

- maxRequestsPerMonth = 10
- requestsCreated = 9

When:

- Two concurrent “create request” actions run

Then:

- Only one consumes successfully
- The other is blocked with:

"Upgrade required"

And final:

- requestsCreated = 10 (never 11)


---

## Row Creation Safety

When the first action of a new month occurs:

- Row is created automatically
- Even under concurrency:
  - only one row exists due to UNIQUE constraint
  - no errors leak to user (handled internally)


---

## No Race Conditions

- Two concurrent exports do not corrupt exportsGenerated
- No lost increments
- No duplicate records for the same month


---

## Limit Enforcement Behavior

If limit is exceeded:

- Action is blocked
- Counter does not change
- Error is clear:

"Upgrade required"


---

## Month Rollover

- New month starts fresh via new (tenantId, yearMonth) row
- Previous months remain unchanged and queryable


---

# Best Practices


## Use Integer YearMonth

- Faster indexes than strings
- Consistent comparisons
- Avoid parsing


---

## Isolation Level

- READ COMMITTED is acceptable when using atomic predicate updates
- Avoid SERIALIZABLE unless proven necessary (performance risk)


---

## Performance

- Single-row update per action
- Indexed by (tenantId, yearMonth)
- Scales well under high concurrency


---

# Observability

Recommended metrics:

- usage.consume.success (by actionType: request|export)
- usage.consume.blocked (limit exceeded)
- usage.consume.failed (db errors)

Optional logs:

- tenantId, yearMonth, actionType, limit, result


---

# Implementation Notes (DB-Agnostic)

- Do not implement read-modify-write in application memory
- Use a single atomic update with:
  - WHERE counter < limit
  - Check affected rows
- Ensure row existence via an idempotent insert (unique constraint handled)


---

# Future Enhancements (Not v1)

- Soft warning thresholds (80%, 90%)
- Overage billing mode (instead of hard block)
- Separate counters per feature type (e.g., pdfExports vs zipExports)
- Real-time usage dashboard
