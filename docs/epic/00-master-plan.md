# Relitrue EPIC — Master Plan

> **Version:** 1.0 — 2026-04-29  
> **Status:** Active  
> **Owner:** Engineering Team  
> **Single source of truth for EPIC scope, decisions, and roadmap.**

## Section 1 — Executive Summary

The EPIC transforms Relitrue from a basic multi-tenant SaaS into an enterprise-grade SaaS competing with Coupa, Workday, and Ramp. It introduces:

- **4-axis access model** (workspaceRole × financialAccess × financeResponsibility × billingAccess) — replaces flat tenant RBAC
- **Finance Teams** — groups of users responsible for processing financial workflows
- **Auto-Assignment Engine** — rules-based routing of records to finance team members
- **Finance Queue** — work queue UI for finance team members
- **Approval Routing Rules** — separate from assignment, governs WHO must approve based on conditions (amount, vendor type, etc.)
- **Out-of-Office + Delegations** — configurable handoff policy
- **Webhooks** — plan-gated to Enterprise tier
- **Enterprise audit improvements** — denormalized counters, snapshot evaluations, soft deletes

The EPIC builds on the cleanup completed in MACRO-FASE A (A1-A6), which:

- Removed legacy schema (3 dead models, 6 dead columns, 1 RBAC bypass)
- Established reconciler service pattern (A4 — `record-approval-status.ts`)
- Established Strategy pattern for channels (A5 — notifications)
- Established integration test harness with Testcontainers (A6 — DB-real tests)

**Estimated scope:** ~52 prompts across 5 macro-phases (B-F), 6-9 weeks of development time using Cursor IDE.

## Section 2 — Stack Constraints

The EPIC operates within the existing stack — NO new frameworks.

Confirmed stack (from `00-core-constitution.mdc`):

- Next.js App Router (no `pages/`)
- React Server Components (default), Client Components only when necessary
- TypeScript strict
- Prisma + PostgreSQL (with pgvector for KB)
- NextAuth (JWT strategy)
- Zod for validation
- Tailwind + shadcn/ui
- Vitest 2.1.9 (unit + integration)
- Testcontainers (`pgvector/pgvector:pg16` for integration tests)

Forbidden:

- Server Actions (mutations always go through Route Handlers)
- `pages/` or `pages/api`
- Alternative ORMs, validation libraries, routing systems

## Section 3 — Macro-Phase Breakdown

| Macro-Phase | Title | Estimated Prompts | Focus |
| --- | --- | --- | --- |
| **B** | Schema Enterprise + Access Model | ~10 | Add 5 enums, modify TenantMembership/TenantInvitation, add 9 new models |
| **C** | Backend APIs | ~14 | Assignment engine, Finance queue, Approval routing rules, Finance Teams CRUD |
| **D** | OOO + Delegations + Webhooks | ~7 | Availability state machine, ApprovalDelegation, WebhookEndpoint + delivery |
| **E** | Frontend | ~10 | UI for finance teams, queue, delegations, settings, webhooks |
| **F** | Hardening | ~5 | Performance, observability, plan-gating enforcement, final audit |

## Section 4 — Decision Log (LOCKED)

| ID | Topic | Decision | Rationale | Date |
| --- | --- | --- | --- | --- |
| D-001 | Access model dimensionality | 4 independent axes (workspaceRole × financialAccess × financeResponsibility × billingAccess) | Each axis solves a distinct enterprise need; combining axes produces 50+ role explosion | 2026-04-29 |
| D-002 | Finance Teams vs Approval Rules | Two separate models (FinanceTeam vs ApprovalRoutingRule) | Assignment (who processes) and approval (who authorizes) are distinct domains | 2026-04-29 |
| D-003 | Assignment evaluation audit | Full snapshot with all candidates + exclusion reasons (FinanceAssignmentEvaluation) | Compliance requirement; debugging mis-assignments | 2026-04-29 |
| D-004 | Delegation expiry mid-work | HYBRID handoff configurable per tenant (TenantFinanceSettings.delegationFinanceHandoffPolicy: HYBRID \| ALWAYS_REVERT \| ALWAYS_KEEP) | Different orgs have different policies; HYBRID covers 80% (IN_PROGRESS=keep, PENDING=revert) | 2026-04-29 |
| D-005 | Webhooks plan tier | Plan-gated to Enterprise tier | Industry standard (Stripe, Datadog, Linear); revenue protection; infrastructure cost justification | 2026-04-29 |
| D-006 | Workload counter | Denormalized in TenantMembership (financeOpenAssignmentsCount), transactional updates + nightly reconciler | Performance at scale; counter drift is detected and corrected nightly | 2026-04-29 |
| D-007 | Soft delete in finance models | deletedAt on FinanceTeam, FinanceTeamMember, FinanceAssignmentRule, FinanceAssignmentRuleCondition, RequestTypePolicy | Audit trail preservation; ability to recover from accidental deletions | 2026-04-29 |
| D-008 | Webhook signing algorithm | HMAC SHA256 | Industry standard; widely supported by webhook consumers | 2026-04-29 |
| D-009 | Integration test policy | Mandatory ONLY for tenant isolation critical features (assignment engine, delegations, webhooks, approval routing) — mocks for the rest | Balance between safety and velocity | 2026-04-29 |
| D-010 | Feature flags policy | ONLY for high-risk features (assignment engine, webhooks) — use existing FeatureFlag + TenantFeatureFlag schema | Avoid feature flag debt for low-risk features | 2026-04-29 |

## Section 5 — Cleanup Foundation (MACRO-FASE A — Completed)

| Phase | Title | Status | Key Deliverable |
| --- | --- | --- | --- |
| A1 | Drop ApprovalRequest + ApprovalAction | ✅ Done | Dead schema removed |
| A2 | Drop Record.amount + Record.currency | ✅ Done | LegacyFieldRemovedError pattern established |
| A3 | Drop User.role + RoleKey + MANAGER bypass | ✅ Done | Legacy RBAC bypass killed; audit-on-bootstrap pattern established |
| A4 | Build Record.approvalStatus reconciler | ✅ Done | First reconciler service pattern (replicable in EPIC for financeStatus, paymentStatus) |
| A5 | Build notifications service unificado | ✅ Done | Strategy pattern for channels (replicable for Slack/Teams/SMS) |
| A6 | Build tenant isolation test harness | ✅ Done | Testcontainers + setPrismaClient DI + 10 smoke tests |

Final metrics:

- 154 tests (144 unit + 10 integration), up from 83 baseline (+86%)
- 7 reusable patterns established
- Zero production data loss
- Zero security regressions

## Section 6 — Patterns Established by Cleanup (Available for EPIC)

| Pattern | Source Phase | EPIC Replication Use Case |
| --- | --- | --- |
| Reconciler service | A4 (`record-approval-status.ts`) | financeStatus, paymentStatus, delegationStatus reconcilers |
| Strategy pattern (channels) | A5 (notification channels) | Webhook signing strategies, future notification channels (Slack, Teams) |
| Client-safe enum constants | A5 (`notification-type-constants.ts`) | All enums exposed to client components |
| LegacyFieldRemovedError | A2 (`common.ts`) | API field deprecation during EPIC refactors |
| Audit-on-bootstrap | A3 (`platform-bootstrap.ts`) | Vendor role grants, tenant suspensions, finance team creation |
| Integration test harness | A6 (`_harness/`) | Tenant isolation tests for assignment engine, delegations, webhooks |
| Pre-execution Docker check | A6 PRE | Verifying prerequisites before planning new infrastructure |

## Section 7 — Definition of Done (Per EPIC Phase)

A phase is complete when:

- All Prisma schema changes applied via `migrate dev` (NEVER `db push`)
- TypeScript clean (`tsc --noEmit`)
- Build succeeds (`npm run build`)
- Unit tests still pass (no regression — 144 baseline as of A6)
- Integration tests added IF the phase touches tenant isolation critical features (D-009)
- Feature flag added IF the feature is high-risk (D-010)
- Final `migrate dev --create-only` produces empty migration (no drift)
- Audit logs created for all sensitive actions
- Plan-gating enforced server-side for plan-gated features
- Documentation updated in `docs/epic/` if architectural decisions changed

## Section 8 — EPIC-wide Conventions

### Naming

- Models: PascalCase (`FinanceTeam`, `ApprovalDelegation`)
- Enums: PascalCase (`MembershipAvailability`)
- Fields: camelCase (`financeResponsibility`, `delegationFinanceHandoffPolicy`)
- API actions in audit logs: dot.snake (`finance.team.created`, `webhook.delivery.failed`)

### Migrations

- Naming: snake_case verb_noun (`add_finance_teams`, `drop_legacy_x`)
- One feature per migration (avoid mixed migrations)
- Always test with empty DB AND with seeded data before merging

### Audit log actions for EPIC

Finance teams: `finance.team.created`, `finance.team.member.added`, `finance.team.member.removed`, `finance.team.deleted` (soft)

Assignments: `record.finance.assigned`, `record.finance.reassigned`, `record.finance.released`

Delegations: `delegation.created`, `delegation.activated`, `delegation.deactivated`, `delegation.expired`

Webhooks: `webhook.endpoint.created`, `webhook.endpoint.disabled`, `webhook.delivery.succeeded`, `webhook.delivery.failed`, `webhook.delivery.retry_exhausted`

Approval routing: `approval.routing_rule.created`, `approval.routing_rule.matched`, `approval.routing_rule.disabled`

## Section 9 — Document Index

This master plan references 7 detailed documents (to be created in subsequent prompts):

| Document | Purpose | Status |
| --- | --- | --- |
| `00-master-plan.md` | This document | ✅ Created |
| `01-access-model.md` | 4-axis access model spec | ⏳ Pending |
| `02-finance-teams.md` | FinanceTeam + members + visibility | ⏳ Pending |
| `03-assignment-engine.md` | Auto-assignment rules + queue + workload counters | ⏳ Pending |
| `04-delegations-ooo.md` | OOO availability + ApprovalDelegation + cron jobs | ⏳ Pending |
| `05-webhooks.md` | WebhookEndpoint + delivery + signing | ⏳ Pending |
| `06-approval-routing.md` | ApprovalRoutingRule (separate from finance assignment) | ⏳ Pending |
| `07-execution-plan.md` | Phase-by-phase breakdown (B1-F5) with prompts list | ⏳ Pending |

## Section 10 — Versioning of this Master Plan

This document is versioned within Git. Significant changes to scope or decisions:

- Increment a version line at the top: `Version: 1.X — Date`
- Add a changelog entry at the bottom under "Changelog"
- Update the relevant decision in the Decision Log table (do NOT delete superseded decisions; mark as DEPRECATED with replacement ID)

Initial version: `Version: 1.0 — 2026-04-29`

### Changelog

| Version | Date | Summary |
| --- | --- | --- |
| 1.0 | 2026-04-29 | Initial master plan: scope B–F, locked decisions D-001–D-010, A-phase foundation, conventions, document index. |
