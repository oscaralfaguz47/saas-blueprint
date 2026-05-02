# MACRO-FASE C — Enterprise Backend Refactor Summary

> **Document type:** EPIC reference / audit trail / onboarding index  
> **Status:** Complete (C1–C14)  
> **Related:** [00-master-plan.md](./00-master-plan.md), [07-execution-plan.md](./07-execution-plan.md)  
> **Scope:** Backend for finance assignment, finance queue, and approval routing (no product UI in this macro-phase)

---

## Table of contents

1. [Overview](#section-1--overview)
2. [Phase-by-phase recap (C1–C14)](#section-2--phase-by-phase-recap-c1c14)
3. [Architectural decisions catalog (D-001–D-010)](#section-3--architectural-decisions-catalog-d-001d-010)
4. [Primitive patterns established](#section-4--primitive-patterns-established)
5. [Test coverage map](#section-5--test-coverage-map)
6. [Tech debt registry](#section-6--tech-debt-registry)
7. [File inventory](#section-7--file-inventory)
8. [Schema evolution map](#section-8--schema-evolution-map)
9. [What was NOT in MACRO-FASE C](#section-9--whats-not-in-macro-fase-c-deferred--out-of-scope)
10. [Next phases preview](#section-10--next-phases-preview)
11. [Lessons learned (process)](#section-11--lessons-learned-process)
12. [Document gaps & verification notes](#document-gaps--verification-notes)

---

## Section 1 — Overview

MACRO-FASE C delivered the **complete enterprise refactor backend** for **finance assignment** and **approval routing** across **14 phases (C1–C14)** over roughly **six weeks** of conceptual and implementation work (recon → plan → agent execution, typically one focused prompt per commit).

The work **builds on MACRO-FASE A** (cleanup, reconciler patterns, integration harness) and **MACRO-FASE B** (enterprise schema: **15 new Prisma models**, **22 new enums**, rolled out via **9 migrations** in the B tranche). MACRO-FASE C **did not re-derive** that schema; it **implemented** authorization, services, route handlers, engines, hooks, and tests on top of it.

### High-level outcomes (headline)

Stakeholder summary (MACRO-FASE C close-out): **305 unit tests + 24 integration tests added during MACRO-FASE C** (final suite: **449 unit + 34 integration**), with **no regressions** in the final verification pass. (*A6 anchor in `00-master-plan.md`: 144 unit + 10 integration.*)

| Metric | Value |
| --- | --- |
| **Unit tests** | **449** total in suite (**+305** vs A6 **144** in `00-master-plan.md`) |
| **Integration tests** | **34 integration tests total in suite** (**+24 integration tests added during MACRO-FASE C** vs A6 **10**) |
| **Regressions** | **No regressions** reported in the MACRO-FASE C close-out verification |
| **Production defects** | **0** production bugs detected (development / empty-DB environment) |
| **Delivery cadence** | **14** phases shipped systematically (**1 prompt ≈ 1 commit** discipline) |
| **Prisma churn in C** | **8** migrations in the C7a–C14 window (see [Schema evolution map](#section-8--schema-evolution-map)); models/enums bulk landed in Phase B |

> **Integration test language:** Use **“+24 integration tests added during MACRO-FASE C”** for the delta; use **“34 integration tests total in suite”** for the absolute count at C14 close (A6 baseline was **10**).

### What MACRO-FASE C is responsible for

- **4-axis access enforcement** in server helpers and APIs (`hasAccess` / action routing).
- **Finance teams**, **finance assignment rules**, **finance assignment engine**, **workload counters**, **finance queue** (start / complete / release), **reassignment** and related **record finance status** reconciliation.
- **Approval routing rules**, **approval routing engine**, **participant lifecycle** integration with the record approval reconciler, **unblock** semantics, and **manual admin re-evaluation** (clear routing-owned pendings, preserve terminal approver states, re-run engine).
- **Mandatory Zod** validation on new/changed APIs, **tenant isolation** on all queries, **audit logs** for sensitive mutations where applicable, and **D-009** integration coverage on isolation-critical paths.

---

## Section 2 — Phase-by-phase recap (C1–C14)

Each phase lists **scope**, **new primitives** (if any), **tests** (unit / integration), **schema**, and **logged tech debt**.  
**Per-phase unit counts** below include **approximate splits** that sum to the known net **+305**; **authoritative totals** are **449 / 34** at close (see Section 5).

#### C1 — 4-Axis Access Model

- **Scope:** Implement `hasAccess()` (and related action routing) enforcing **workspaceRole × financialAccess × financeResponsibility × billingAccess** with server-side resolution only.
- **New primitive:** `src/server/security/access-model.ts` (React `cache()`-wrapped resolution where applicable).
- **Tests:** **+36** unit, **0** integration (example anchor count from phase notes).
- **Schema:** **No new migrations** (consumes 4-axis fields delivered in MACRO-FASE B).
- **Tech debt:** **TD-C1-001** — `cache()` requires primitive, stable arguments (documented calling convention).
- **Deliverables:** Centralized **action → predicate** matrix; eliminated duplicated “if OWNER then …” logic spread across handlers.
- **Primary consumers:** Tenant membership PATCH, invitation acceptance, finance/routing admin routes (later phases).
- **Risk mitigated:** **Client-forged role axes** cannot elevate privileges — all enforcement is recomputed from DB membership rows.

#### C2 — Member Upsert + Invitation Canonicalization

- **Scope:** Tenant membership APIs **PATCH** 4-axis fields with **forbidden combination** validation; align invitation acceptance with canonical membership state.
- **New primitive:** Extended **`src/server/security/tenant-authorization.ts`** patterns for membership mutations; Zod refinements on member/invitation payloads.
- **Tests:** **~+22** unit (membership + validation branches), **0** integration.
- **Schema:** **None** in C2 (invitation/membership columns from B).
- **Tech debt:** None specific beyond **TD-C3-001** if invitation tests share harness stubs (logged under C3).
- **Deliverables:** `member.ts` / `invitation.ts` validation refinements; invitation accept routes copy **exact** axis bundle to membership.
- **Risk mitigated:** **Invalid axis combinations** fail **before** DB write; avoids “half-written” enterprise RBAC states.

#### C3 — Finance Team Member Attach / Remove

- **Scope:** **FinanceTeamMember** add/remove under tenant scope with **visibility** and **counter** rules (D-006); assumes teams already exist (see **C4**).
- **New primitive:** Member routes under `finance-teams/[teamId]/members` + transactional counter updates on member churn.
- **Tests:** **~+20** unit, **0** integration.
- **Schema:** **None** (teams/members from B).
- **Tech debt:** **TD-C3-001** — `setup.ts` / NextResponse cookies stub limitations for some API tests.
- **Deliverables:** Finance team **membership** mutations; transactional **open assignment counter** maintenance on attach/remove.
- **Risk mitigated:** **Cross-tenant** member writes — routes resolve tenant from session membership, not raw params alone.

#### C4 — FinanceTeam CRUD

- **Scope:** Implement CRUD endpoints for **FinanceTeam** (named groups of finance-responsible users for assignment routing).
- **New primitive:** Permission **`tenant.financial_config.manage`** used consistently for finance configuration surfaces (teams, rules, departments/cost centers in the same family).
- **Endpoints:**
  - `GET` / `POST` `/api/tenant/finance-teams`
  - `GET` / `PATCH` / `DELETE` `/api/tenant/finance-teams/[teamId]`
- **Tests:** **+32** unit, **0** integration.
- **Schema:** **No new** (uses `FinanceTeam` / `FinanceTeamMember` from Phase B, including `20260430174752_add_finance_teams`).
- **Tech debt:** None.
- **Deliverables:** Team authoring API for finance ops; foundation for C3 member attach and assignment rules referencing `teamId`.
- **Risk mitigated:** **Unauthorized** team mutation — gated by `tenant.financial_config.manage` + tenant isolation on all queries.

> **Note:** **Departments** and **cost centers** APIs predate MACRO-FASE A/B in this repo (`git log` on `src/app/api/tenant/departments/` shows early history); they are **not** the C4 deliverable. C4 is **FinanceTeam** CRUD only.

#### C5 — Finance Assignment Rule CRUD + Tier Enforcement

- **Scope:** **FinanceAssignmentRule** + conditions CRUD; **plan / tier** enforcement server-side; rule ordering and soft-delete (D-007).
- **New primitive:** `src/lib/validations/finance-assignment-rule.ts`; tenant routes under `finance-assignment-rules`.
- **Tests:** **~+24** unit, **0** integration; establishes **counter regression** pattern (see Section 4).
- **Schema:** **None** new in C5 if assignment tables from B.
- **Tech debt:** **TD-C6-001** (carried into assignment-engine phase expectations): rule test breadth vs target (see Section 6).
- **Deliverables:** Rule ordering semantics; soft-delete visibility rules; **enterprise plan** gating for advanced strategies/conditions (exact matrix in code).
- **Risk mitigated:** **Plan bypass** via raw API — tier checks live server-side next to mutations.

#### C6 — Finance Assignment Engine V1 (evaluate on record creation path)

- **Scope:** Pure **finance assignment engine** with **FinanceAssignmentEvaluation** snapshot persistence (D-003); strategies (round-robin, least-loaded, team lead, specific member, composite).
- **New primitive:** `src/server/services/finance-assignment-engine/**` (+ `evaluate-condition.ts`, `exclusion-reasons.ts`).
- **Tests:** **~+30** unit (engine + strategies + conditions), **~+2** integration (tenant isolation / engine smoke per D-009).
- **Schema:** **None** if evaluation tables from B.
- **Tech debt:** **TD-C6-001** — depth of `finance-assignment-rules` tests vs 40–50 target.
- **Deliverables:** Deterministic **strategy dispatch**; rich **exclusion reasons** for snapshots; guardrails for “no eligible candidate”.
- **Risk mitigated:** **Non-deterministic** “silent skip” — evaluation rows justify why nobody was assigned.

#### C7a — Engine Foundations + Event Types

- **Scope:** Additional **RecordEventType** / finance event vocabulary; engine “foundations” alignment and drift checks.
- **New primitive:** Event-type alignment for downstream hooks and audit/timeline consistency.
- **Tests:** **~+12** unit, **~+1** integration.
- **Schema:** **Migrations:** `20260501140000_c7a_engine_foundations`, `20260501015849_c7a_drift_recheck` (enum/event alignment + drift hygiene).
- **Tech debt:** **TD-C7a-001** — cache dedup / RSC-flavored tests may need harness upgrades.
- **Deliverables:** Enum cardinality locked to **timeline** + **audit** writers; reduces stringly-typed events.
- **Risk mitigated:** **Drift** between Prisma enum and writers — `migrate diff` / empty migration discipline enforced at phase close.

#### C7b — Tier Enforcement in API

- **Scope:** Centralize **plan gating** and **feature flag** (D-010) checks on finance endpoints; fail closed when disabled.
- **New primitive:** Shared guard helpers reused by finance APIs.
- **Tests:** **~+8** unit, **0** integration.
- **Schema:** **None**.
- **Tech debt:** **TD-C7b-001** — numeric coverage vs target for API matrix.
- **Deliverables:** Consistent **403/404** concealment patterns for plan failures (exact shape per API contract rule).
- **Risk mitigated:** **Dual enforcement** drift — guards colocated with route handlers, not only middleware.

#### C8 — Finance Hook + Async Propagation + Counters + Post-transaction Engine

- **Scope:** Wire **record-approval** reconciler hook to run **finance assignment** after approval milestones; **async-safe** propagation; **denormalized counters** (D-006); **post-transaction** engine invocation with explicit error handling.
- **New primitive:** `src/server/services/approval-completion-hook.ts` (finance side effects from approval completion); coordination with `record-finance-status.ts`.
- **Tests:** **~+31** unit, **~+3** integration (cross-service path; large hook + reconciler mock matrix; phase table keeps **+305** total with **C4** at **+32**).
- **Schema:** **None** (unless event types completed in C7a).
- **Tech debt:** **TD-C8-002** — pre-C8 API tests may emit **stderr noise** from real hooks in certain harness configurations.
- **Deliverables:** **A4 reconciler** integration point — finance assignment becomes a **state-machine follower**, not a standalone cron.
- **Risk mitigated:** **Partial commits** — transactional writes commit before engine retries; engine exceptions don’t roll back approval truth unintentionally (see post-tx pattern).

#### C9 — Finance Queue + Atomic Pickup

- **Scope:** **Finance queue** list and **start / complete / release** with **compare-and-swap** style **conditional `updateMany`** for race-safe pickup (single assignee wins).
- **New primitive:** `src/server/security/finance-queue-authorization.ts`; `src/app/api/finance/queue/**`; queue validations `src/lib/validations/finance-queue.ts`.
- **Tests:** **~+20** unit, **~+2** integration.
- **Schema:** **Migration:** `20260501120000_c9_queue_event_types` (queue-related event/enumeration alignment).
- **Tech debt:** None blocking; pattern catalogued (Section 4).
- **Deliverables:** **Finance operator** workflow primitives — start/complete/release — all tenant-scoped.
- **Risk mitigated:** **Double pickup** under concurrency — conditional updates + explicit “lost race” responses.

#### C10 — Finance Reassignment + Counter SWAP

- **Scope:** **Reassign** finance assignee; **atomic counter SWAP** between members; reassignment audit/event types.
- **New primitive:** Reassignment route `src/app/api/finance/assignments/[recordId]/reassign/route.ts` + transactional counter semantics.
- **Tests:** **~+18** unit, **~+1** integration.
- **Schema:** **Migration:** `20260501140000_c10_reassignment_event_type`.
- **Tech debt:** None beyond general coverage goals.
- **Deliverables:** **Admin / lead** corrective action for mis-assignment without breaking audit trail.
- **Risk mitigated:** **Counter leak** on reassignment — SWAP ensures totals reflect exactly one active assignee workload shift.

#### C11 — Approval Routing Rule CRUD + Sub-resources

- **Scope:** **ApprovalRoutingRule** CRUD; nested **conditions** and **approvers** endpoints; soft-delete (D-007) and tenant isolation.
- **New primitive:** `src/lib/validations/approval-routing-rule.ts`; `src/app/api/tenant/approval-routing-rules/**`.
- **Tests:** **~+14** unit, **0** integration (CRUD primarily mocked/unit).
- **Schema:** **Migration:** `20260501161924_c11_drift` (schema drift / alignment — keep name as in repo).
- **Tech debt:** None uniquely logged.
- **Deliverables:** Authoring surface for **who must approve** independent of finance assignment rules.
- **Risk mitigated:** **Cross-tenant** rule reads via `ruleId` guessing — handlers verify `tenantId` on the parent rule chain.

#### C12 — Approval Participants + Status Lifecycle

- **Scope:** Participant APIs and lifecycle transitions needed for routing (including **PENDING_BLOCKED** readiness) integrated with existing record participant model.
- **New primitive:** Participant action routes under `src/app/api/records/[id]/participants/**` (extensions as required by routing).
- **Tests:** **~+12** unit, **~+1** integration.
- **Schema:** **None** new if participant statuses from B; verify enum extensions in B9.
- **Tech debt:** **Soft-revoke** with `revokedAt` semantics documented for routing (foundational for C14).
- **Deliverables:** Participant **action** endpoints align with **sequential** gating (`PENDING_BLOCKED`).
- **Risk mitigated:** **Unauthorized approver** actions — participant routes re-check **tenant + role + participant membership**.

#### C13a — Approval Routing Engine V1

- **Scope:** **Approval routing engine** resolves approvers from rules, creates/updates participants, respects sequential vs parallel modes; integrates with **A4 reconciler** and **PENDING_BLOCKED** gating; **`recomputeApprovalStatus`** post-conditions.
- **New primitive:** `src/server/services/approval-routing-engine/index.ts`, `resolve-approvers.ts`, `unblock-next-step.ts`.
- **Tests:** **~+10** unit, **~+5** integration (engine + isolation).
- **Schema:** **Migration:** `20260501172600_c13a_approval_routing_engine` (engine-related enum/field alignment).
- **Tech debt:** **TD-C13a-001** — direct **orchestrator unit tests** deferred (favor integration + focused units).
- **Deliverables:** Routing **evaluations** + participant mutations; reconciler now **blocks** advance when sequential rules demand it.
- **Risk mitigated:** **Approval bypass** — engine runs server-side only; clients cannot inject approver lists.

#### C13b — Approvers Unblocked Event + Hook Chain

- **Scope:** Emit **approvers unblocked** event type; **chain** finance completion hook with **approval unblock** hook for coherent cross-engine behavior; **whitelist trigger guarding** for efficiency.
- **New primitive:** `src/server/services/approval-unblock-hook.ts`; hook composition pattern (engine vs hook module split).
- **Tests:** **~+8** unit, **~+5** integration (unblock + chaining).
- **Schema:** **Migration:** `20260502120000_c13b_approvers_unblocked`.
- **Tech debt:** **TD-C13b-001** — Vitest `hookTimeout` **90s → 180s** (resolved during C13b; see Section 6).
- **Deliverables:** **Unblock** is a first-class event — timeline readers can distinguish “unblocked” from “approved”.
- **Risk mitigated:** **Storm** of engine invocations — whitelist guards prevent accidental recursive re-entrancy paths.

#### C14 — Manual Admin Re-evaluation + Clear and Re-run

- **Scope:** **Platform / tenant admin** manual **re-evaluation** of approval routing: **clear** routing-owned `PENDING` / `PENDING_BLOCKED` participants, emit **`APPROVERS_CLEARED`**, preserve **terminal** `APPROVED` / `REJECTED` rows (`preserveTerminal`), **reactivate / attach / activeRouting / create** decision tree for admin path, then **re-run engine** with `ADMIN_MANUAL_REEVALUATION` trigger semantics.
- **New primitive:** `POST /api/records/[recordId]/routing/evaluate`; engine guardrails for admin trigger vs standard triggers.
- **Tests:** **~+8** unit (guard + engine branches), **~+4** integration (reevaluation flows); phase totals stay consistent with **+305** net when combined with C8’s larger hook suite above.
- **Schema:** **Migration:** `20260503140000_c14_approvers_cleared` (`RecordEventType.APPROVERS_CLEARED`).
- **Tech debt:** **TD-C14-001** — rename `EXISTING_APPROVERS` → `EXISTING_ROUTING_APPROVERS` (deferred); **TD-C14-002** — engine semantic refinement (`routingRuleId NOT NULL` filter on `RECORD_CREATED` globally) deferred.
- **Deliverables:** **Break-glass** operations tool for admins when routing rules change mid-flight.
- **Risk mitigated:** **Duplicate approver rows** after re-eval — `activeRouting` + attach/reactivate tree prevents `@@unique([recordId, userId, APPROVER])` violations.

---

## Section 3 — Architectural decisions catalog (D-001–D-010)

All items below are **locked** in `00-master-plan.md` (v1.0 — 2026-04-29). **Status** reflects whether later work **revised operational semantics** without rewriting the master plan row (see **Supplement — C14** below for the **clear-and-reevaluate** v2 policy).

| ID | Date locked | Question / context | Decision | Rationale | First applied (phase) | Status |
| --- | --- | --- | --- | --- | --- | --- |
| **D-001** | 2026-04-29 | How many independent RBAC dimensions? | **4 axes:** workspaceRole × financialAccess × financeResponsibility × billingAccess | Avoids combinatorial “role explosion”; each axis maps to a real enterprise concern | B2 / **C1** enforcement | **Active** |
| **D-002** | 2026-04-29 | Should assignment and approval rules share a model? | **Separate models:** `FinanceTeam` / assignment rules vs `ApprovalRoutingRule` | Processing vs authorization are distinct domains | B5/B8 vs B9 / **C6 vs C11–C14** | **Active** |
| **D-003** | 2026-04-29 | How much audit for assignment evaluations? | **Full snapshot** with candidates + exclusion reasons (`FinanceAssignmentEvaluation`) | Compliance + debuggability | B8 / **C6** | **Active** |
| **D-004** | 2026-04-29 | Delegation expiry while work in flight? | **HYBRID** default + per-tenant policy (`TenantFinanceSettings.delegationFinanceHandoffPolicy`) | Org-specific operational reality | B6 (schema) — **implementation deferred past MACRO-FASE C** | **Active** (schema only in C) |
| **D-005** | 2026-04-29 | Which plan tier includes webhooks? | **Enterprise** tier gating | Standard SaaS packaging; infra cost | B10 (schema) — **not implemented in C** | **Active** (backend delivery in MACRO-FASE E per roadmap) |
| **D-006** | 2026-04-29 | How to track finance workload? | **Denormalized counter** on `TenantMembership` + transactional updates + nightly reconciler | Read performance at scale | B5 / **C3–C10** | **Active** |
| **D-007** | 2026-04-29 | Delete strategy for finance/routing config? | **Soft delete** (`deletedAt`) on finance/routing models | Recovery + audit | B / **C5, C11** | **Active** |
| **D-008** | 2026-04-29 | Webhook signing algorithm | **HMAC SHA256** | Industry standard | Not in C | **Active** (future webhook worker) |
| **D-009** | 2026-04-29 | Integration test policy | **Mandatory** for tenant-isolation-critical features (assignment, delegations, webhooks, approval routing) | Balance safety vs velocity | **C6–C10, C13–C14** | **Active** |
| **D-010** | 2026-04-29 | Feature flag breadth | **Only high-risk** features (assignment engine, webhooks) using `FeatureFlag` / `TenantFeatureFlag` | Avoid flag debt | **C7b+** assignment gates | **Active** |

### Revisions & clarifications (without superseding D-001–D-010)

- **Manual re-evaluation semantics (C14):** Operational policy shifted from an **add-only** merge mental model to **clear-and-reevaluate** for routing-owned pendings (**v2**), with **terminal preservation** and a **reactivate / attach / activeRouting / create** tree. This **does not invalidate** D-002/D-003; it **specializes** privileged admin flows.
- **Test harness stability (C13b):** Integration stability improvements (hook timeout) **support D-009**; no decision ID change.

### Supplement — C14 manual re-evaluation semantics (v2 operational policy)

**Context:** Administrative **manual** routing re-evaluation must coexist with **parallel** routing steps, **soft-revoked** approvers, and **terminal** decisions without violating participant uniques or rewriting audit history.

**Locked operational rules (C14):**

1. **Clear** routing-owned **`PENDING`** and **`PENDING_BLOCKED`** participants as part of admin re-eval (transactional clear + audit + timeline event).
2. **`preserveTerminal`:** **Do not** clear **`APPROVED`** / **`REJECTED`** approver rows; they remain part of audit truth.
3. **Decision tree** for admin reattachment: **`activeRouting`** shortcut (parallel with existing active approver), **`revoked` reactivation**, **`manual` attach**, else **`create`** — prevents duplicate approver rows and honors soft revoke.
4. **Engine trigger:** `ADMIN_MANUAL_REEVALUATION` bypasses certain “existing approver” short-circuit paths that apply to automatic triggers; **`EXISTING_APPROVERS`** participant sourcing applies when trigger ≠ admin (exact condition codified in `approval-routing-engine/index.ts`).
5. **New event type:** `RecordEventType.APPROVERS_CLEARED` (migration `20260503140000_c14_approvers_cleared`).

**Status:** **Active** for all admin re-eval paths; future rename (**TD-C14-001**) is cosmetic. **Supersedes** any pre-C14 informal note that suggested **add-only** re-evaluation for admin.

#### Expanded rationale per decision (implementation memory)

- **D-001 (4 axes):** Every MACRO-FASE C API resolves **membership** from the DB, then evaluates **action keys** through `hasAccess`. Client-supplied tenant/workspace hints are **never** authority.
- **D-002 (split domains):** Finance assignment mutates **processing** state (`financeStatus`, queue, counters) while approval routing mutates **authorization** participants — cross-links happen only through **hooks** and **reconcilers**, never by reusing one rule table for both.
- **D-003 (evaluation snapshots):** Mis-assignments are debugged from **`FinanceAssignmentEvaluation`** JSON without replaying production traffic.
- **D-004 (delegation HYBRID):** Present in schema; **MACRO-FASE C** does not implement cron activators — plan MACRO-FASE D/E per execution plan.
- **D-005 + D-008 (webhooks):** Schema may exist; **no** signing or delivery worker shipped in C.
- **D-006 (counters):** All queue and reassignment paths update counters **in the same transaction** as the record transition when feasible; tests use **counter regression** assertions.
- **D-007 (soft delete):** Rules/teams remain queryable for audit; APIs filter `deletedAt IS NULL` unless explicitly admin-historical (future).
- **D-009 (integration tests):** Finance engine, queue, reassignment, routing engine, unblock, and manual re-eval have **DB-real** coverage — see file inventory test list.
- **D-010 (feature flags):** Assignment/routing entry points **fail closed** when feature flags deny the capability — never UI-only gating.

---

## Section 4 — Primitive patterns established

For each pattern: **description**, **introduced**, **canonical location**, **when to reuse**.

1. **Counter regression test pattern (C5)**  
   - **Description:** When mutating D-006 counters, assert **before/after** on both affected memberships and record state in the same test case to catch drift regressions.  
   - **Canonical:** Finance team member tests + reassignment tests (`src/test/api/finance-team-members.test.ts`, `src/test/api/finance-reassignment.test.ts`).  
   - **Reuse:** Any new counter mutation (delegation handoff, bulk admin tools).

2. **CAS race-safety with conditional `updateMany` (C9, refined C10/C13b/C14)**  
   - **Description:** Encode optimistic concurrency via **conditional filters** (`where` includes expected prior state) so **at most one** writer wins; pair with **count === 1** checks where applicable.  
   - **Canonical:** Finance queue start/complete/release routes + services backing `src/app/api/finance/queue/**`.  
   - **Reuse:** Queue pickup, token-grant patterns, idempotent job claiming.

3. **Hook chaining pattern (C8 finance + C13b unblock)**  
   - **Description:** Keep hooks **composable**: finance completion triggers assignment; approval unblock triggers routing advancement; **order** and **guard conditions** explicit.  
   - **Canonical:** `approval-completion-hook.ts`, `approval-unblock-hook.ts` + reconciler call sites.  
   - **Reuse:** Future notification side-effects, webhook fan-out (post D/E).

4. **Post-transaction engine call with `try/catch` (C8 → C13a → C13b → C14)**  
   - **Description:** Run engines **after** durable state + audit in the transaction; **isolate** engine failures so core state remains committed; log/trace without leaking internals to clients.  
   - **Canonical:** Record approval reconciler integration paths + `POST .../routing/evaluate` orchestration.  
   - **Reuse:** Any “state machine write + best-effort derivation” workflow.

5. **`vi.hoisted` object reference for TDZ safety (C8)**  
   - **Description:** In Vitest, use **hoisted mutable object** for mocks referenced in `vi.mock` factories to avoid temporal dead zone issues with `const` mocks.  
   - **Canonical:** Hook/reconciler tests in `src/test/server/approval-completion-hook.test.ts` (pattern referenced in phase notes).  
   - **Reuse:** Complex ESM mock graphs in server tests.

6. **Counter SWAP atomic pattern (C10)**  
   - **Description:** On reassignment, **decrement** old assignee and **increment** new assignee in a **single transaction**; avoid negative counts; re-run reconciler if needed.  
   - **Canonical:** `src/app/api/finance/assignments/[recordId]/reassign/route.ts` + services.  
   - **Reuse:** Delegation reassignment, admin “force move” queue operations.

7. **Conditional `updateMany` + `count === 1` race-safe queue (C9)**  
   - **Description:** Treat **`updateMany` result count** as the commit token for “did I win the race?”  
   - **Canonical:** Finance queue services used by `start` / `complete` / `release`.  
   - **Reuse:** Single-consumer leases, debounced state transitions.

8. **Soft-revoke with `revokedAt` (B12 / used C12 + C14)**  
   - **Description:** Prefer **soft revoke** over hard delete for approvers/assignments where **audit** requires continuity; reactivation paths must **clear** `revokedAt` deliberately.  
   - **Canonical:** Participant mutations + approval routing engine participant branches.  
   - **Reuse:** Delegation overrides, admin corrective actions.

9. **Reactivate / attach / `activeRouting` / create decision tree (C14)**  
   - **Description:** On admin re-eval, pick the **minimal mutation** that restores routing without violating uniques: prefer **reactivate** soft-revoked, **attach** existing user row, **`activeRouting`** for parallel continuity, else **create**.  
   - **Canonical:** `src/server/services/approval-routing-engine/index.ts` (admin trigger branches).  
   - **Reuse:** Any “rebuild graph from partial state” admin tool.

10. **`preserveTerminal` flag / behavior (C14)**  
    - **Description:** When clearing pendings, **never** destroy **terminal** approval outcomes; maintains **audit fidelity** for `APPROVED`/`REJECTED`.  
    - **Canonical:** Clearing query in `POST .../routing/evaluate` transaction + engine assumptions.  
    - **Reuse:** Bulk reroute tools, rule migration scripts.

11. **Schema-grounded recon discipline (C13a → C13b → C14)**  
    - **Description:** Before coding, **re-read** Prisma schema + migrations for **enum cardinality**, **unique constraints**, and **event types**; block prompts on ambiguity.  
    - **Canonical:** Phase notes + migration filenames in `prisma/migrations/*c13*` / `*c14*`.  
    - **Reuse:** All future macro-phases (especially UI+D/E when client payloads appear).

12. **Whitelist trigger guarding (C13b)**  
    - **Description:** Only run expensive unblock/hook work when **trigger/event** ∈ allowed set; prefer **whitelist** over growing **skip lists**.  
    - **Canonical:** `approval-unblock-hook.ts` guard + reconciler integration.  
    - **Reuse:** Webhook dispatch, notification fan-in filtering.

13. **Module separation: engine vs hook (C13b)**  
    - **Description:** **Engine** = deterministic resolution from state; **hook** = orchestration, guards, post-tx calls, telemetry.  
    - **Canonical:** `approval-routing-engine/**` vs `approval-unblock-hook.ts` / `approval-completion-hook.ts`.  
    - **Reuse:** Finance assignment engine already follows same separation (`finance-assignment-engine/**` vs hooks).

---

## Section 5 — Test coverage map

> **Note on per-phase test counts:** The total test counts in this section are exact (verified by `npm test` execution at the close of each phase). Per-phase delta splits shown in the table are best-effort reconstruction based on prompt-level commits — they sum to the exact totals (**+305** unit, **+24** integration) but individual phase numbers may have ±1–2 deviation if test files were touched outside the canonical phase commit (e.g., tech debt fixes folded in). For audit-grade per-phase verification, use `git log --stat` on each phase commit hash.

### Totals progression (MACRO-FASE A exit → MACRO-FASE C close)

| Milestone | Unit tests (suite total) | Integration tests (suite total) | Integration delta vs A6 |
| --- | ---: | ---: | --- |
| MACRO-FASE A exit (`00-master-plan.md`) | **144** | **10** | — |
| MACRO-FASE C close (verified in phase checklist) | **449** | **34** | **+24** integration tests added during MACRO-FASE C |
| **Net change (MACRO-FASE C)** | **+305** | — (see **34** total) | **+24** (10 → 34 absolute) |

### Phase table (approximate deltas — planning aid)

**Legend:** ✓ = explicit D-009-style isolation coverage expected; **~** = approximate unit delta (sums to +305).

| Phase | Unit Δ (~) | Running unit (~) | Int Δ (~) | Running int (~) | Isolation-critical paths (D-009) |
| --- | ---: | ---: | ---: | ---: | --- |
| Baseline (A6) | — | 144 | — | 10 | — |
| C1 | 36 | 180 | 0 | 10 | No |
| C2 | 22 | 202 | 0 | 10 | No |
| C3 | 20 | 222 | 0 | 10 | No |
| C4 | 32 | 254 | 0 | 10 | No |
| C5 | 24 | 278 | 0 | 10 | No |
| C6 | 30 | 308 | 2 | 12 | ✓ |
| C7a | 12 | 320 | 1 | 13 | ✓ |
| C7b | 8 | 328 | 0 | 13 | No |
| C8 | 31 | 359 | 3 | 16 | ✓ |
| C9 | 20 | 379 | 2 | 18 | ✓ |
| C10 | 18 | 397 | 1 | 19 | ✓ |
| C11 | 14 | 411 | 0 | 19 | No |
| C12 | 12 | 423 | 1 | 20 | ✓ |
| C13a | 10 | 433 | 5 | 25 | ✓ |
| C13b | 8 | 441 | 5 | 30 | ✓ |
| C14 | 8 | **449** | 4 | **34** | ✓ |

> **See also:** transparency note at the **top of Section 5** for per-phase split methodology.

### Test infrastructure improvements

| Item | Status | Notes |
| --- | --- | --- |
| **TD-C13b-001** Vitest `hookTimeout` **90s → 180s** | **Resolved** | Permanent integration stability fix (KB + long hooks) |
| **TD-B2-001** KB retrieval flakiness | **Resolved** | Per phase notes: stabilized alongside hook timeout / harness tuning in C13b |
| **`seedScaleSubscription` extracted** | **Done (C13a)** | `src/test/integration/_harness/seed-scale-subscription.ts` |
| **TD-C13a-001** Engine orchestrator direct unit tests | **Deferred** | Prefer current integration + focused units until F-phase |

---

## Section 6 — Tech debt registry

### Active (deferred to F-phase or later)

| ID | Description |
| --- | --- |
| **TD-C1-001** | React `cache()` requires primitive args (documented pattern; **no code action** unless misuse appears) |
| **TD-C3-001** | `setup.ts` NextResponse cookies stub limitations |
| **TD-C6-001** | `finance-assignment-rules` depth: **19** tests vs **40–50** target |
| **TD-C7a-001** | Cache dedup test needs **RSC harness** |
| **TD-C7b-001** | API matrix coverage: **13** unit + **7** integration vs target |
| **TD-C8-002** | Pre-C8 API tests **stderr noise** from real hook in some runs |
| **TD-C13a-001** | **Engine direct unit tests** for orchestrators deferred |
| **TD-C14-001** | Rename **`EXISTING_APPROVERS`** → **`EXISTING_ROUTING_APPROVERS`** (clarity) |
| **TD-C14-002** | Engine semantic refinement: filter **`routingRuleId NOT NULL`** globally on `RECORD_CREATED` paths |

**Other known follow-ups (not always ID’d in phase logs):**

- **3 KB components import `@prisma/client` directly** — track under **F5** hygiene sweep.
- **A5 deferred `records/summary/route.ts` refactor** — already deferred pre-EPIC; still pending.
- **Legacy `TenantUserRole` / `TenantRolePermission` system** remains; **deprecate in F4** per roadmap notes.
- **Engine `requireAll` semantic** deferred (C13a notes): always **“all”** resolution for now.
- **`triggerOnAmountChange` field** exists **without enforcement** until an **amount-edit endpoint** exists.
- **`CREATOR_MANAGER` `targetType` deferred** until `User.managerId` (or equivalent) exists.

### Resolved during MACRO-FASE C

| ID | Resolution |
| --- | --- |
| **TD-B2-001** | KB retrieval flakiness mitigated (**C13b** harness / timeout / isolation discipline) |
| **TD-C13b-001** | Vitest `hookTimeout` permanent fix (**90s → 180s**) |

---

## Section 7 — File inventory

**Convention:** Listed paths are **canonical entry points**; some files pre-existed but were **substantially extended** during C—called out explicitly.

### Security & access

| File | Role |
| --- | --- |
| `src/server/security/access-model.ts` | **C1** `hasAccess` / 4-axis evaluation |
| `src/server/security/finance-queue-authorization.ts` | **C9** queue action authorization |
| `src/server/security/tenant-authorization.ts` | **Extended C2+** tenant/membership guards |

### Services — finance assignment

| File | Role |
| --- | --- |
| `src/server/services/finance-assignment-engine/index.ts` | Engine orchestrator |
| `src/server/services/finance-assignment-engine/evaluate-condition.ts` | Rule condition evaluator |
| `src/server/services/finance-assignment-engine/exclusion-reasons.ts` | Snapshot exclusion reasons |
| `src/server/services/finance-assignment-engine/strategies/index.ts` | Strategy registry |
| `src/server/services/finance-assignment-engine/strategies/least-loaded.ts` | Strategy |
| `src/server/services/finance-assignment-engine/strategies/round-robin.ts` | Strategy |
| `src/server/services/finance-assignment-engine/strategies/round-robin-then-least.ts` | Strategy |
| `src/server/services/finance-assignment-engine/strategies/specific-member.ts` | Strategy |
| `src/server/services/finance-assignment-engine/strategies/team-lead.ts` | Strategy |
| `src/server/services/finance-assignment-engine/strategies/types.ts` | Shared types |
| `src/server/services/record-finance-status.ts` | Finance status derivation/recompute helpers |
| `src/server/services/member-access.ts` | Membership access helpers (finance visibility) |

### Services — approval routing

| File | Role |
| --- | --- |
| `src/server/services/approval-routing-engine/index.ts` | Routing engine |
| `src/server/services/approval-routing-engine/resolve-approvers.ts` | Approver resolution |
| `src/server/services/approval-routing-engine/unblock-next-step.ts` | Sequential unblock |
| `src/server/services/approval-completion-hook.ts` | Approval-milestone → finance hook |
| `src/server/services/approval-unblock-hook.ts` | Unblock orchestration / chain |

### API endpoints — tenant / finance configuration (summary)

| Route | Purpose |
| --- | --- |
| `src/app/api/tenant/finance-teams/route.ts` | List/create teams |
| `src/app/api/tenant/finance-teams/[teamId]/route.ts` | Team CRUD |
| `src/app/api/tenant/finance-teams/[teamId]/members/route.ts` | Members list/add |
| `src/app/api/tenant/finance-teams/[teamId]/members/[memberId]/route.ts` | Member remove |
| `src/app/api/tenant/finance-assignment-rules/route.ts` | Rules list/create |
| `src/app/api/tenant/finance-assignment-rules/[ruleId]/route.ts` | Rule get/patch/soft-delete |
| `src/app/api/tenant/approval-routing-rules/route.ts` | Routing rules list/create |
| `src/app/api/tenant/approval-routing-rules/[ruleId]/route.ts` | Rule get/patch/soft-delete |
| `src/app/api/tenant/users/[userId]/role/route.ts` | Membership 4-axis updates (C2) |
| `src/app/api/tenant/departments/**` | Departments (pre-EPIC org backbone; `tenant.financial_config.manage` in C) |
| `src/app/api/tenant/cost-centers/**` | Cost centers (pre-EPIC; same permission family as finance config) |

### API endpoints — full `src/app/api/tenant/**` inventory (new or materially touched in C)

> Many routes below pre-existed for core tenant administration; **MACRO-FASE C** materially extended **membership axes**, **finance**, **routing**, and **org** surfaces. Rows marked **C** were primary deliverables of the macro-phase.

| Route | MACRO-FASE C relevance |
| --- | --- |
| `src/app/api/tenant/route.ts` | Tenant bootstrap / listing (unchanged pattern; used by harness) |
| `src/app/api/tenant/[tenantId]/route.ts` | Tenant detail |
| `src/app/api/tenant/[tenantId]/logo/route.ts` | Logo |
| `src/app/api/tenant/[tenantId]/logo/confirm/route.ts` | Logo confirm |
| `src/app/api/tenant/[tenantId]/logo/upload-url/route.ts` | Logo upload URL |
| `src/app/api/tenant/permissions/route.ts` | Effective permission reads |
| `src/app/api/tenant/primary-owner/transfer/route.ts` | Sensitive ownership transfer (audit) |
| `src/app/api/tenant/users/route.ts` | Member listing |
| `src/app/api/tenant/users/[userId]/role/route.ts` | **C** — PATCH **4-axis** membership |
| `src/app/api/tenant/users/[userId]/status/route.ts` | Member enable/disable |
| `src/app/api/tenant/invitations/route.ts` | Invitation create/list |
| `src/app/api/tenant/invitations/accept/route.ts` | Accept invite |
| `src/app/api/tenant/invitations/validate/route.ts` | Validate token |
| `src/app/api/tenant/invitations/mine/route.ts` | Invitee view |
| `src/app/api/tenant/invitations/reject/route.ts` | Reject |
| `src/app/api/tenant/invitations/[id]/accept/route.ts` | Accept by id |
| `src/app/api/tenant/invitations/[id]/reject/route.ts` | Reject by id |
| `src/app/api/tenant/invitations/[id]/resend/route.ts` | Resend |
| `src/app/api/tenant/invitations/[id]/revoke/route.ts` | Revoke |
| `src/app/api/tenant/invitations/[id]/reinvite/route.ts` | Reinvite |
| `src/app/api/tenant/finance-teams/route.ts` | **C** — teams |
| `src/app/api/tenant/finance-teams/[teamId]/route.ts` | **C** — team |
| `src/app/api/tenant/finance-teams/[teamId]/members/route.ts` | **C** — members |
| `src/app/api/tenant/finance-teams/[teamId]/members/[memberId]/route.ts` | **C** — remove member |
| `src/app/api/tenant/finance-assignment-rules/route.ts` | **C** — rules |
| `src/app/api/tenant/finance-assignment-rules/[ruleId]/route.ts` | **C** — rule |
| `src/app/api/tenant/approval-routing-rules/route.ts` | **C** — routing rules |
| `src/app/api/tenant/approval-routing-rules/[ruleId]/route.ts` | **C** — routing rule |
| `src/app/api/tenant/departments/route.ts` | **Pre-EPIC** — departments (`tenant.financial_config.manage`) |
| `src/app/api/tenant/departments/[id]/route.ts` | **Pre-EPIC** — department |
| `src/app/api/tenant/cost-centers/route.ts` | **Pre-EPIC** — cost centers |
| `src/app/api/tenant/cost-centers/[id]/route.ts` | **Pre-EPIC** — cost center |

### API endpoints — finance queue & assignments

| Route | Purpose |
| --- | --- |
| `src/app/api/finance/queue/route.ts` | Queue listing |
| `src/app/api/finance/queue/[recordId]/start/route.ts` | Start / claim |
| `src/app/api/finance/queue/[recordId]/complete/route.ts` | Complete |
| `src/app/api/finance/queue/[recordId]/release/route.ts` | Release |
| `src/app/api/finance/assignments/[recordId]/reassign/route.ts` | Reassign |

### API endpoints — records / routing

| Route | Purpose |
| --- | --- |
| `src/app/api/records/[recordId]/routing/evaluate/route.ts` | **C14** manual admin re-evaluation |
| `src/app/api/records/[id]/participants/**` | Participant lifecycle APIs used by routing |

### Validation schemas (`src/lib/validations/`)

| File | Domain |
| --- | --- |
| `src/lib/validations/finance-assignment-rule.ts` | Assignment rules |
| `src/lib/validations/finance-queue.ts` | Queue actions |
| `src/lib/validations/finance-team.ts` | Teams |
| `src/lib/validations/approval-routing-rule.ts` | Routing rules |
| `src/lib/validations/member.ts` | Membership axes |
| `src/lib/validations/invitation.ts` | Invitations |
| `src/lib/validations/record.ts` | Record payloads touching finance/routing fields |
| `src/lib/validations/index.ts` | Barrel exports |

### Tests — representative inventory

**Security / server unit**

- `src/test/security/access-model.test.ts`
- `src/test/server/finance-queue-authorization.test.ts`
- `src/test/server/record-finance-status.test.ts`
- `src/test/server/approval-completion-hook.test.ts`
- `src/test/server/approval-unblock-hook.test.ts`
- `src/test/server/finance-assignment-engine/engine.test.ts`
- `src/test/server/finance-assignment-engine/evaluate-condition.test.ts`
- `src/test/server/finance-assignment-engine/strategies.test.ts`
- `src/test/server/approval-routing-engine/evaluate-assign-guard.test.ts`
- `src/test/server/approval-routing-engine/resolve-approvers.test.ts`
- `src/test/server/approval-routing-engine/unblock-next-step.test.ts`

**API tests**

- `src/test/api/finance-teams.test.ts`
- `src/test/api/finance-team-members.test.ts`
- `src/test/api/finance-assignment-rules.test.ts`
- `src/test/api/finance-queue-list.test.ts`
- `src/test/api/finance-queue-actions.test.ts`
- `src/test/api/finance-reassignment.test.ts`
- `src/test/api/approval-routing-rules.test.ts`
- `src/test/api/records-routing-evaluate.test.ts`

**Integration — tenant isolation**

- `src/test/integration/tenant-isolation/finance-assignment-engine.integration.test.ts`
- `src/test/integration/tenant-isolation/approval-routing-engine.integration.test.ts`
- `src/test/integration/tenant-isolation/approval-routing-unblock.integration.test.ts`
- `src/test/integration/tenant-isolation/approval-routing-reevaluation.integration.test.ts`

### Test harness / infrastructure

| File | Role |
| --- | --- |
| `src/test/integration/_harness/prisma-test-client.ts` | Prisma test client |
| `src/test/integration/_harness/container.ts` | Testcontainers lifecycle |
| `src/test/integration/_harness/setup.ts` | Global setup |
| `src/test/integration/_harness/reset-db.ts` | DB reset |
| `src/test/integration/_harness/seed-tenants.ts` | Tenant seed |
| `src/test/integration/_harness/seed-scale-subscription.ts` | **C13a** extracted scaler |
| `src/test/integration/_harness/auth-helpers-mocks.ts` | Auth mocking |
| `src/test/integration/_harness/index.ts` | Harness barrel |

---

## Section 8 — Schema evolution map

**Verification (2026-05-01):** `prisma/migrations/` contains **93** subdirectories (each with `migration.sql`) and **94** top-level entries including `migration_lock.toml` (PowerShell: `(Get-ChildItem prisma/migrations -Directory).Count` → **93**).

### Migration evolution (folder counts)

| Stage | Count | Notes |
| --- | ---: | --- |
| **Pre-EPIC baseline** (folders with name `< 20260429183000_drop_approval_request_legacy`) | **N = 70** | SaaS foundation, billing, records v1, KB, auth, etc. |
| **MACRO-FASE A kickoff + pre-B alignment** (contiguous tranche `20260429183000` … `20260430002520`) | **+M = 6** | Includes **3** legacy drops (A1–A3 per `00-master-plan.md`) plus `add_approval_event_types`, `add_notification_enums_and_category`, `drift_verify`. |
| **MACRO-FASE B schema** (B2–B10, **9** migrations) | **+9** | Listed below — delivers bulk enterprise models/enums. |
| **MACRO-FASE C runtime additions** (drift/engine/queue/routing events) | **+K = 8** | Listed below — **C7a** through **C14** engineering migrations. |
| **Final state** (as of C14 close) | **P = 93** | **70 + 6 + 9 + 8 = 93** ✓ |

> **Audit note:** **N** and **M** are defined by **ordered migration folder names** in `prisma/migrations/`, not by git tags. For commit-level attribution, use `git log -- prisma/migrations`.

### Specific MACRO-FASE B migrations (B2–B10)

| Prompt | Migration folder |
| --- | --- |
| B2 | `20260430165944_add_4_axis_access_enums_and_membership_fields` |
| B3 | `20260430171821_add_4_axis_to_tenant_invitation` |
| B4 | `20260430173511_add_membership_availability` |
| B5 | `20260430174752_add_finance_teams` |
| B6 | `20260430192311_add_tenant_finance_settings` |
| B7 | `20260430194037_add_approval_delegations` |
| B8 | `20260430195710_add_finance_assignment_engine` |
| B9 | `20260430201608_add_approval_routing` |
| B10 | `20260430203351_add_webhooks` |

**Related schema not in the B2–B10 nine** (still part of the broader EPIC record/org foundation): e.g. `20260415120000_add_departments_cost_centers`, `20260414180000_extend_record_finance_fields`, `20260413180000_add_record_domain_foundation`, `20260425120000_add_participant_viewed_event` — these sit in the **N = 70** pre-baseline tranche or the **M = 6** alignment window as ordered by timestamp.

### Specific MACRO-FASE C migration additions

| Phase window | Migration folder |
| --- | --- |
| C7a | `20260501015849_c7a_drift_recheck` |
| C7a | `20260501140000_c7a_engine_foundations` |
| C9 | `20260501120000_c9_queue_event_types` |
| C10 | `20260501140000_c10_reassignment_event_type` |
| C11 | `20260501161924_c11_drift` |
| C13a | `20260501172600_c13a_approval_routing_engine` |
| C13b | `20260502120000_c13b_approvers_unblocked` |
| C14 | `20260503140000_c14_approvers_cleared` |

### Final state (semantics)

- **P = 93** migration folders under `prisma/migrations/` at C14 close.
- **4-axis fields** enforced in **server helpers** and **APIs** (C1–C3), not only in schema.
- **Approval routing** participant lifecycle and **finance queue** semantics aligned with **D-006** counters and **D-003** evaluation snapshots.
- **D-001–D-010** govern schema decisions; treat B/C migrations as **frozen contracts** unless a new migration is opened with an explicit recon note.

---

## Section 9 — What was NOT in MACRO-FASE C (deferred / out of scope)

**Deliberately not delivered** in MACRO-FASE C:

- **All end-user UI** for finance/routing (deferred to **MACRO-FASE D/E** per roadmap).
- **Webhook delivery system** — D-005 locked Enterprise gating; **B10** created schema placeholders; **no delivery worker** in C.
- **Plan billing UI** — pre-EPIC surfaces remain; **no redesign** in C.
- **Email template changes** — no notification template work in C.
- **Migration of production data** — development used **empty DB** assumptions; **no** historic data migration tooling in C.
- **`CREATOR_MANAGER` approver targetType** — awaits **`User.managerId`** (or equivalent schema).
- **Amount-change auto-trigger** — `triggerOnAmountChange` exists; **no amount-edit endpoint** ⇒ no enforcement.
- **`triggerOnAdminReevaluation` flag** — manual re-eval reuses **`triggerOnCreate`** / admin trigger path; separate flag deferred.

---

## Section 10 — Next phases preview

> **Note on MACRO numbering:** The original `docs/epic/07-execution-plan.md` defined macro phases differently:
> - **Original D:** Out-of-Office (OOO) / Delegations
> - **Original E:** Webhooks
> - **Original F:** UI work
>
> During MACRO-FASE C execution, the team revised the macro numbering to reflect actual delivery priority:
> - **Revised D: UI Integrations** (this is the next phase)
> - **Revised E: Webhooks** (D-005 Enterprise tier feature)
> - **Revised F: Tech Debt + Cleanup + Delegations**
>
> **Action:** `07-execution-plan.md` will be updated to reflect this revised numbering as part of MACRO-FASE D pre-planning. Until then, the **revised** numbering shown below is authoritative.

### MACRO-FASE D — UI integrations (backend-ready)

- **4-axis access** surfaces on **member edit** + **invite** flows.
- **Finance team** management UI.
- **Finance queue** UI (start/complete/release).
- **Finance assignment rule** editor.
- **Approval routing rule** editor (sequential vs parallel semantics).
- **Manual re-eval** admin button + confirmation modal (calls `POST /routing/evaluate`).
- **Plan-gating UX** (inline upgrade prompts; server remains authoritative).

### MACRO-FASE E — Webhooks (D-005 Enterprise tier)

- **HMAC SHA256** signing (D-008).
- **Delivery retries** with backoff + idempotency keys.
- **Event subscription** UI + admin diagnostics.

### MACRO-FASE F — Tech debt + cleanup

- Burn down **Section 6** TD list.
- **Deprecate legacy** `TenantUserRole` pathways (F4).
- **Engine orchestrator** direct unit tests (**TD-C13a-001**).
- **Coverage gap fills** (C6/C7x targets).

---

## Section 11 — Lessons learned (process)

### What worked well

- **Schema-grounded recon** before coding caught **enum/unique** hazards early (especially **C13b/C14**).
- **Hard stop conditions** on prompts prevented **UI creep** and scope expansion inside backend phases.
- **1 prompt ≈ 1 commit** produced a **readable bisect history** and clean reviews.
- **Spikes** before complex prompts (C7+) surfaced **ambiguity** in routing/finance interactions early.
- **Hook chaining** remained **composable** across phases (finance + unblock).
- **Tooling assists** (plan critiques, secondary passes) often improved **plan quality** before expensive implementation.
- **Recon → Plan → Agent** sequencing meant prompts rarely started “cold”; the plan doc acted as an **executable contract** for the agent run.
- **Counter regression** and **CAS** tests caught **real** race bugs during queue/reassignment development — cheap insurance compared to production incidents.
- **Integration tests on Postgres** (Testcontainers) validated **tenant isolation** in ways unit mocks cannot; D-009 investment paid off whenever engines touched `RecordParticipant` uniques.

### What to refine for MACRO-FASE D (UI)

- UI prompts may need **tighter visual feedback loops** (screenshots, component states).
- **Component library** choices (data tables, wizards) benefit from a **pre-D spike**.
- Consider **Storybook** (or equivalent) **only if** it clears ROI vs maintenance — decision not made in C.
- **Visual QA** will dominate cycle time; backend’s **1-prompt-1-commit** rhythm may need **parallel** UI + API verification prompts (still keeping commits reviewable).
- **Accessibility** and **responsive** constraints should be explicit in D prompts — C did not establish UI patterns for dense admin forms (rules editors).

### Cross-phase coupling (why order mattered)

This section is intentionally **process-oriented**: it explains **blockers** that the execution plan called out and that proved true in implementation.

1. **C1 before C2/C3:** Without `hasAccess`, every membership mutation would have re-implemented ad hoc checks — a security non-starter in a multi-tenant system.
2. **C6 before C8:** The hook must call a **stable engine** with persisted evaluations; half-wired triggers would have created **silent non-assignment** states.
3. **C9/C10 after counters:** Queue and reassignment both assume **D-006** discipline — implementing them before team attach rules would have yielded **drift-by-design**.
4. **C11 before C13:** Routing CRUD establishes **data** the engine consumes; engine-first would have required throwaway fixtures.
5. **C13a before C13b:** Unblock hooking requires **engine-correct** baseline participant graphs; otherwise unblock tests become **snapshot churn**.
6. **C14 last:** Manual re-eval is the **most invasive** approval mutation; it required **mature** engine + hook + event vocabulary to avoid breaking earlier phases.

### Security & tenancy checklist (for onboarding engineers)

When extending MACRO-FASE C code, verify **all** of the following on every new route:

1. **Authenticate** the session inside the handler (never assume middleware alone is sufficient for authorization).
2. **Resolve tenant** from membership, not from unchecked client identifiers.
3. **Scope queries** with `tenantId` / `workspaceId` predicates at the **query boundary** (no “fetch then filter”).
4. **Conceal** missing resources as **404** when the alternative would leak existence across tenants.
5. **Audit** sensitive mutations (ownership, routing clears, reassignment) with stable action names per `00-master-plan.md` conventions.
6. **Plan-gate** enterprise features server-side (UX hints are optional; server enforcement is mandatory).
7. **Feature-flag** high-risk engine paths per **D-010** — **fail closed**.

### Observability notes (intentionally light in C)

MACRO-FASE C focused on **correctness** and **auditability** over metrics cards. MACRO-FASE F should add:

- **Structured logs** around engine exceptions (without PII leakage).
- **Counters** for engine failures / retries (once async workers exist).
- **Traces** across reconciler → hook → engine for slow-path debugging.

### Glossary (terms reused in D/E/F planning)

| Term | Meaning |
| --- | --- |
| **4-axis access** | `workspaceRole × financialAccess × financeResponsibility × billingAccess` (`D-001`). |
| **Assignment engine** | Finance **processing** router — chooses finance assignee from rules (`finance-assignment-engine/**`). |
| **Routing engine** | Approval **authorization** router — ensures correct approver participants exist (`approval-routing-engine/**`). |
| **Reconciler (A4)** | `record-approval-status` service — source of truth driver for approval state transitions; hooks plug in here. |
| **PENDING_BLOCKED** | Sequential routing gate — record cannot advance until prior step clears. |
| **CAS / conditional update** | Compare-and-swap via filtered `updateMany` — concurrency control pattern. |
| **SWAP counters** | Atomic decrement/increment pair across two `TenantMembership` rows during reassignment. |
| **Snapshot evaluation** | Persisted `FinanceAssignmentEvaluation` / routing evaluation rows for audit (`D-003` spirit). |
| **Soft revoke** | `revokedAt` (or equivalent) marks a participant inactive without erasing history. |
| **preserveTerminal** | Admin clearing of pendings must not delete `APPROVED`/`REJECTED` approver outcomes (`C14`). |
| **clear-and-reevaluate** | **C14 v2** admin policy — remove routing-owned pendings, then rerun engine (not add-only merge). |
| **D-009 path** | Tenant isolation–critical feature set requiring **integration** tests on real Postgres. |
| **D-010 gate** | Feature-flag enforcement for **high-risk** features (assignment engine, future webhooks). |

---

## Document gaps & verification notes

Use this checklist to harden this document into an **audit-grade** artifact:

1. **Per-phase unit/integration deltas** — see Section 5 transparency note; use `git log --stat` on phase commits for audit-grade splits.
2. **Integration language** — standardized in Section 1 / 5 (**+24** delta vs **34** suite total).
3. **Migration counts** — Section 8 verified against `prisma/migrations/` directory listing (**P = 93** folders).
4. **C4 scope** — **FinanceTeam** CRUD only; departments/cost centers documented as **pre-EPIC** in Section 2 + file inventory.
5. **Macro numbering** — Section 10 block; `07-execution-plan.md` update tracked for D pre-planning.

---

### Changelog

| Version | Date | Author | Summary |
| --- | --- | --- | --- |
| 0.1 | 2026-04-30 | Engineering | Initial MACRO-FASE C summary from phase notes + repo recon |
| 0.2 | 2026-05-01 | Engineering | Test-count transparency; integration delta vs total language; verified migration counts (N/M/P); C4 = FinanceTeam CRUD; macro numbering note in Section 10 |
