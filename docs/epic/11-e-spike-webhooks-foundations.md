# E-Spike Decision Document — MACRO-FASE E (Webhooks) Foundations

> **Document type:** Locked architecture / phase plan / safety policy for outbound webhooks  
> **Status:** Active (v1.0)  
> **Related:** [05-webhooks.md](./05-webhooks.md) (**authoritative technical spec**), [09-d-spike-ui-patterns.md](./09-d-spike-ui-patterns.md) (**Path A**), [10-macro-fase-d-summary.md](./10-macro-fase-d-summary.md) (prior macro outcomes), [07-execution-plan.md](./07-execution-plan.md) (historical macro numbering — use with caution), [00-master-plan.md](./00-master-plan.md) (D-005, D-008, D-010)

This document locks **MACRO-FASE E** delivery patterns for **outbound tenant webhooks** (Relitrue → customer HTTPS endpoints). It mirrors the **D-Spike** discipline ([09](./09-d-spike-ui-patterns.md)) while adding **non-negotiable Paddle isolation** and **plan-tier reconciliation**.

---

## Table of contents

1. [Executive summary](#section-1--executive-summary)
2. [Decision catalog E-001–E-010](#section-2--decision-catalog-e-001e-010)
3. [Paddle zero-touch policy](#section-3--paddle-zero-touch-policy)
4. [Phase structure E-1 → E-9](#section-4--phase-structure-e-1--e-9)
5. [Path A discipline](#section-5--path-a-discipline)
6. [Reuse from MACRO-FASES B / C / D](#section-6--reuse-from-macro-fases-b--c--d)
7. [Inconsistencies in epic 05 to track](#section-7--inconsistencies-in-epic-05-to-track)
8. [Handoff notes for E-1](#section-8--handoff-notes-for-e-1)
9. [Changelog](#section-9--changelog)

---

## Section-level index (approximate line anchors, v1.0)

| Section | Lines (approx.) | Topic |
| --- | ---: | --- |
| Header + TOC | L1–L40 | Metadata |
| §1 Executive summary | L42–L99 | Scope, safety, Path A, master-plan bridge |
| §2 Decision catalog | L102–L218 | E-001–E-010 + dependency matrix |
| §3 Paddle policy | L221–L280 | OFF-LIMITS list |
| §4 Phase structure | L283–L388 | E-1–E-9 + dependency graph |
| §5 Path A | L391–L434 | Budgets, E-5 review, forbidden deps |
| §6 Reuse | L437–L462 | B/C/D + non-reuse |
| §7 Epic 05 drift | L465–L480 | EU-DOC-001–007 |
| §8 Handoff E-1 | L483–L519 | Files + verification |
| §9 Changelog | L522–L530 | Revisions |
| Appendices A–D | L532–EOF | Math, refs, phase map, Paddle inventory |

---

## Section 1 — Executive summary

### What MACRO-FASE E delivers

MACRO-FASE E implements **outbound webhooks** per **[05-webhooks.md](./05-webhooks.md)**: tenants configure **`WebhookEndpoint`** rows (HTTPS URLs, subscribed events, hashed secrets), the platform **enqueues** **`WebhookDelivery`** rows on domain events, and a **worker** performs **signed POST** delivery with **retries**, **dead-letter** semantics, and **plan / permission** enforcement.

### Nine implementation phases (plus completed recon)

| Slice | Name |
| --- | --- |
| **E-Setup** | Recon + foundations doc (**this file**) — **DONE** |
| **E-1** | Plan gate + permission + `PlanFeatures.webhooks` foundations |
| **E-2** | **Outbound** HMAC signing + delivery primitives (**greenfield**, not Paddle) |
| **E-3** | **`WebhookEndpoint` CRUD** Route Handlers |
| **E-4** | Background **delivery worker** + backoff + auto-disable |
| **E-5** | **Enqueue** from domain events (initial catalog) |
| **E-6** | Subscription **management UI** (7th workspace settings tab) |
| **E-7** | **Delivery history** UI |
| **E-8** | Test hook + diagnostics |
| **E-9** | Summary doc + handoff to **MACRO-FASE F** |

**Math:** **9** numbered phases (**E-1…E-9**) + **E-Setup** recon slice = **10** execution checkpoints; “9-phase structure” refers to **E-1 through E-9**.

### Paddle zero-touch (critical)

**Inbound Paddle billing webhooks** are **production-critical**, **working**, and **orthogonal** to outbound tenant webhooks. MACRO-FASE E **must not modify** listed Paddle/billing files without **explicit user approval** before any patch (**E-004**). Outbound signing **does not** reuse Paddle’s **`paddle-signature`** scheme (**E-008**).

### Path A continues

UI work in **E-6–E-8** follows **[09-d-spike-ui-patterns.md](./09-d-spike-ui-patterns.md)**: controlled forms, **`useApiFetch`**, **no RHF**, **no SWR/TanStack Query**, **`Dialog` + `Spinner` + `Badge`**, inline validation errors on mutations. **`PlanGateBanner`** ([10](./10-macro-fase-d-summary.md) / D-7) gates Enterprise-only UX.

### Out of scope for E

- **Inbound** Paddle webhook behavior changes (**zero-touch**).
- **Delegations / OOO** event volume (**F-phase** dependencies) — deferred events listed under **E-010**.
- **Shared HMAC library** unifying Paddle inbound and Relitrue outbound — **forbidden in E**; **F-phase** optional proposal only.

### Cross-doc hierarchy

| Document | Role |
| --- | --- |
| **[05-webhooks.md](./05-webhooks.md)** | Payloads, signing headers, worker pseudocode, event catalog |
| **This doc (11)** | Locked decisions, phase plan, Paddle firewall |
| **[09](./09-d-spike-ui-patterns.md)** | UI stack Path A |
| **[10](./10-macro-fase-d-summary.md)** | Prior macro context |

### Relationship to master-plan decisions

| Master ID | Topic | MACRO-FASE E application |
| --- | --- | --- |
| **D-005** | Enterprise webhooks tier | **E-001** maps tier to **`scale`** + **`PlanFeatures.webhooks`** |
| **D-008** | HMAC SHA256 | **E-008** outbound signing (distinct from Paddle) |
| **D-010** | Feature flags for high-risk infra | Optional **`FT_WEBHOOKS_ENABLED`** per tenant — fail closed if adopted (**05 §1**) |

### Why outbound is greenfield despite existing tables

**Prisma** models landed in **MACRO-FASE B** per roadmap; **MACRO-FASE C** delivered finance/routing APIs — **tenant webhook CRUD** was **not** shipped. **E-3** therefore introduces **new** Route Handlers against **existing** tables (not “migration from scratch”) (**EU-DOC-003**).

---

## Section 2 — Decision catalog E-001–E-010

Each row: **ID**, **decision**, **rationale**, **05 reference**.

### E-001 — Plan tier reconciliation

| Field | Content |
| --- | --- |
| **Decision** | Marketing **“Enterprise”** maps to existing **`PlanCatalog`** tier code **`scale`**. **No** new tier row. |
| **`PlanFeatures`** | Add **`webhooks: boolean`** in **E-1**. |
| **Values** | **`free` / `starter` / `pro`** → **`webhooks: false`**; **`scale`** → **`webhooks: true`**. |
| **Rationale** | Avoid schema proliferation; **`scale`** is already the top commercial tier with enterprise-style caps ([10](./10-macro-fase-d-summary.md), catalog). |
| **05 reference** | §1 plan gating (**D-005**); tier naming in prose vs code reconciled here. |

### E-002 — Nine-phase structure

| Field | Content |
| --- | --- |
| **Decision** | Phases **E-1–E-9** as enumerated in §4; **E-Setup** recon precedes E-1. |
| **Rationale** | Mirrors D-Spike cadence; separates **foundation**, **API**, **worker**, **enqueue**, **UI**, **diagnostics**, **close-out**. |
| **05 reference** | Whole-doc rollout; CRUD + worker historically described across B/C in header — **implemented in E** (see §7). |

### E-003 — Path A continues

| Field | Content |
| --- | --- |
| **Decision** | Same UI discipline as **[09](./09-d-spike-ui-patterns.md)**: controlled state, **`useApiFetch`**, **no** new **`ui/`** primitives unless small extraction; **no RHF** in E; defer RHF to **F**. |
| **LOC** | Soft cap **≤700 lines per file**; **≤1500 LOC per phase delta** (same order of magnitude as D-Spike budgets). |
| **Review** | **E-5 checkpoint** (mid macro): evaluate Path A strain after enqueue + event wiring (mirror **D-3 review** concept). |
| **Path B** | Same trigger matrix family as [09 §4](./09-d-spike-ui-patterns.md) (form size, validation bugs, staleness, optimism need). |

### E-004 — Paddle policy ZERO TOUCH

| Field | Content |
| --- | --- |
| **Decision** | **Do not modify** production Paddle billing webhook pipeline during E unless **explicit user pre-approval**. Outbound work is **greenfield** beside it. |
| **Rationale** | Billing correctness > feature velocity; avoids accidental coupling. |
| **Implementation** | Full path list — **[§3](#section-3--paddle-zero-touch-policy)**. |

### E-005 — Direction priority

| Field | Content |
| --- | --- |
| **Decision** | **Outbound first** (Relitrue → customer). **Inbound Paddle** not in E scope. |
| **Rationale** | Epic 05 defines **customer subscription** product; Paddle is separate billing integration. |
| **05 reference** | §1 purpose (outbound callbacks). |

### E-006 — Subscription model scope

| Field | Content |
| --- | --- |
| **Decision** | **`WebhookEndpoint.tenantId`** only — **no** `workspaceId` column (**per B-phase / 05 §2**). |
| **Caps** | Max endpoints per tenant — **default 10** per [05 §2](./05-webhooks.md); exact enforcement in **E-1 / E-3** Zod + API. |
| **05 reference** | §2 model sketch + constraints. |

### E-007 — Delivery semantics

| Field | Content |
| --- | --- |
| **Decision** | **At-least-once** delivery; consumer dedupes via **`X-Relitrue-Event-Id`** ([05 §6](./05-webhooks.md)). |
| **Async** | Enqueue via **extended** background job / delivery queue pattern ([05 §7](./05-webhooks.md)). |
| **Timeout** | **5s** per HTTP attempt ([05 §1](./05-webhooks.md)). |
| **Backoff** | Exponential schedule per **05 §3 / §7** — finalized in **E-4**. |
| **Terminal statuses** | **`SUCCEEDED`**, **`FAILED_FINAL`**, **`CANCELED`** ([05 §3](./05-webhooks.md)). |
| **Concurrency** | Worker claims rows with **`FOR UPDATE SKIP LOCKED`** ([05 §7](./05-webhooks.md)). |
| **Endpoint health** | Consecutive failures → auto-disable — thresholds in **E-4** per **05 §2**. |

### E-008 — HMAC signing format (outbound)

| Field | Content |
| --- | --- |
| **Decision** | **`X-Relitrue-Signature`** and header set per **[05 §6](./05-webhooks.md)** — **distinct** from Paddle **`paddle-signature`** / **`ts;h1`** layout (**E-004**). |
| **Algorithm** | **HMAC-SHA256** over signing payload (**D-008** master plan). |
| **Secrets** | Store **`secretHash`** + **`secretHint`**; raw secret **once** at create/rotate ([05 §2](./05-webhooks.md)). |
| **Rotation** | **`POST …/rotate-secret`** (or equivalent) in **E-3** — contract aligned with 05. |

### E-009 — Permission model

| Field | Content |
| --- | --- |
| **Decision** | New permission **`tenant.webhooks.manage`**. |
| **RBAC** | Default grant to **OWNER** + **ADMIN** roles (seed / `ROLE_PERMS` pattern — mirror financial_config style). |
| **UI** | **`WORKSPACE_SETTINGS_PERMISSIONS`** (or successor constant) must include this permission for tab access; **`ALL_TABS`** gains **7th** tab entry (**E-6**). |
| **05 reference** | Admin diagnostics + endpoint management imply privileged operators. |

### E-010 — Event catalog v1 (enqueue scope for E-5)

**Initial events (E-5):**

| Event | Notes |
| --- | --- |
| `record.created` | Record creation path |
| `record.finance.assigned` | Resolves **`C7-WEBHOOK-001`** TODO in assignment engine |
| `record.approval.requested` | Entry to approval flow |
| `record.approval.completed` | Align payload schema with reconciler vocabulary (**verify exact event string vs internal enums in E-5**) |
| `record.payment.status_changed` | Existing payment domain |
| `record.closed` | Terminal |

**Deferred (post-E or F):**

- **`record.delegation.*`** — depends on **OOO / delegations** macro work.
- **`record.evidence.*`** — lower priority; track as tech debt if needed.

**05 reference** | §4 catalog — superset in doc; E-5 implements **subset** above first.

### Decision dependency matrix (quick reference)

| Decision | Enables |
| --- | --- |
| **E-001** | UI/API plan checks for **E-3–E-7** |
| **E-004** | Safe parallel development vs Paddle |
| **E-006** | Query shape for **E-3** (`tenantId` only) |
| **E-007** | Worker design **E-4** |
| **E-008** | **E-2** implementation contract |
| **E-009** | Tab visibility **E-6** |
| **E-010** | Scope boundary for **E-5** |

---

## Section 3 — Paddle zero-touch policy

### Purpose

Paddle **inbound** webhooks power subscription truth, invoices, and reconciliation. **Any regression is revenue-critical.** MACRO-FASE E builds **outbound** infrastructure **without** refactoring Paddle paths “for convenience.”

### Hard stop

1. **No commits** touching files in **§3.2** during E-phase **without explicit user approval** documented in the prompt/PR.
2. **No extraction** of Paddle HMAC into a shared module used by outbound signing **in E-phase**.
3. **No shared idempotency helper** between **`BillingEvent`** (Paddle `providerEventId`) and **`WebhookDelivery.eventId`** **in E-phase**.

F-phase may propose **optional** refactors with a **migration plan** — **separate** approval.

### OFF-LIMITS file list (canonical paths)

**Route handlers**

- `src/app/api/billing/paddle/webhook/route.ts`
- `src/app/api/internal/billing/replay-webhook-event/route.ts`
- `src/app/api/billing/change-plan/route.ts`
- `src/app/api/billing/reconcile/route.ts`

**Paddle provider modules** (`src/server/billing/providers/paddle/`)

- `verify-webhook-signature.ts`
- `handle-webhook-event.ts`
- `handle-transaction-completed.ts`
- `map-paddle-event.ts`
- `paddle-types.ts`
- `create-checkout-session.ts`
- `fetch-subscription.ts`
- `sync-transactions-from-paddle.ts`
- *(any new file added under this directory during E — treat as **off-limits** unless exception granted)*

**Billing webhook helpers** (`src/server/billing/webhooks/`)

- `persist-first.ts` *(note: path is **`webhooks/persist-first.ts`**, not `billing/persist-first.ts`)*
- `update-event-status.ts`

**Billing logging**

- `src/server/billing/billing-log.ts`

**Additional Paddle API integration** (`src/server/billing/paddle/**`)

- Includes `paddle-api.ts`, `subscriptions/*`, `transactions/*`, `customer/*`, `invoices/*` — **do not modify for outbound webhooks work**; changes risk billing side effects.

### Rationale summary

| Reason | Detail |
| --- | --- |
| **Isolation** | Paddle verification uses **vendor-specific** header shape — outbound uses **Relitrue** headers (**05 §6**). |
| **Risk** | Shared abstractions invite subtle coupling bugs. |
| **Velocity** | Greenfield outbound modules under e.g. `src/server/webhooks-outbound/` (exact tree chosen in E-2/E-3) avoid merge conflicts with Paddle. |

### Enforcement expectation

Code review **must** reject accidental Paddle touches. CI optional future guard: path-filtered job (proposal only).

---

## Section 4 — Phase structure E-1 → E-9

### Dependency graph (logical)

```text
E-1 (plan + permission + features)
  → E-2 (signing + delivery primitives)
    → E-3 (endpoint CRUD API)
      → E-4 (worker)
        → E-5 (enqueue from domain)
          → E-6 (subscription UI)
            → E-7 (delivery history UI)
              → E-8 (diagnostics)
                → E-9 (summary + F handoff)
```

### Risk ordering (why E-4 before heavy UI)

Shipping **worker + retry semantics** before polished UI reduces the chance of **silent non-delivery** when **E-6** exposes endpoints to operators. Exact sequencing **E-4 vs E-5** may be swapped **once** behind a written spike (enqueue stub vs worker stub) — document the choice in **E-4** prompt.

### Per-phase summary

#### E-1 — Plan gate + permission + foundations

| Attribute | Detail |
| --- | --- |
| **Scope** | Add **`PlanFeatures.webhooks`**; extend **`resolve-tenant-plan`** / catalog mapping (**scale=true**); seed **`tenant.webhooks.manage`**; document max endpoints constant. |
| **Key surfaces** | `src/server/billing/provider-types.ts`, `src/server/billing/plans/catalog.ts`, `src/server/billing/resolve-tenant-plan.ts`, `src/lib/tenant-role-permissions.ts` (or equivalent), Prisma seed if applicable |
| **Est. LOC** | **Small–medium** (~200–400) |
| **Depends on** | None (foundational) |
| **Cadence** | Recon existing plan resolution → Plan → Agent |

#### E-2 — HMAC signing utility + delivery primitives

| Attribute | Detail |
| --- | --- |
| **Scope** | **New module(s)** implementing **05 §6** signing (**not** Paddle); HTTP **`fetch`** wrapper with **5s** abort; header builder; **no** edits to Paddle files. |
| **Suggested location** | New directory under `src/server/` dedicated to outbound webhooks (name TBD — explicit in E-2 prompt). |
| **Est. LOC** | **Medium** (~400–700) |
| **Depends on** | E-1 (feature flag semantics optional for unit tests) |
| **Cadence** | Spec §6 walkthrough → Plan → Agent |

#### E-3 — WebhookEndpoint CRUD API

| Attribute | Detail |
| --- | --- |
| **Scope** | Route Handlers under `src/app/api/tenant/webhook-endpoints/**` (exact paths Zod-validated); tenant isolation; soft-delete; **`subscribedEvents`** validation vs catalog; rotate-secret; **HTTPS** enforcement prod. |
| **Est. LOC** | **Medium–large** (~600–900 across routes + validations) |
| **Depends on** | E-1 permission; E-2 optional for shared constants |
| **05** | §2 CRUD expectations |

#### E-4 — Background job worker

| Attribute | Detail |
| --- | --- |
| **Scope** | Worker tick (cron or extend `processPendingBackgroundJobs` pattern); claim **`WebhookDelivery`**; state transitions; backoff table; **`SKIP LOCKED`**; endpoint failure counters + **`DISABLED_AUTO`**. |
| **Est. LOC** | **Large** (~700–1200) |
| **Depends on** | E-3 (endpoints exist); E-2 signing |
| **05** | §7 |

#### E-5 — Event enqueue from domain events

| Attribute | Detail |
| --- | --- |
| **Scope** | Wire **E-010** events; **`enqueueWebhookDeliveries`** transactional pattern; deterministic **`eventId`**; respect **`tenant.webhooks`** plan gate; remove **`C7-WEBHOOK-001`** TODO when firing `record.finance.assigned`. |
| **Est. LOC** | **Medium–large** (touches multiple services) |
| **Depends on** | E-4 worker exists (may stub worker first — order locked in implementation plan) |
| **Checkpoint** | **Path A / complexity review** (E-003) |

#### E-6 — Subscription management UI

| Attribute | Detail |
| --- | --- |
| **Scope** | **7th tab** in workspace settings; list/create/edit endpoints; **`PlanGateBanner`**; controlled forms; secret-once UX |
| **Est. LOC** | **Large** (~800–1200) |
| **Depends on** | E-3 APIs live |

#### E-7 — Delivery history UI

| Attribute | Detail |
| --- | --- |
| **Scope** | Paginated delivery log; status badges; link to endpoint |
| **Est. LOC** | **Medium** |

#### E-8 — Test hook + diagnostics

| Attribute | Detail |
| --- | --- |
| **Scope** | Safe test delivery (admin-only or gated); optional replay tool per **05** retention notes |
| **Est. LOC** | **Small–medium** |

#### E-9 — Summary doc + handoff F

| Attribute | Detail |
| --- | --- |
| Scope | **`12-macro-fase-e-summary.md`** (name TBD), metrics, TD list, F backlog |
| Est. LOC | **Doc-only** |

### Phase count verification

| Item | Count |
| --- | ---: |
| **E-1–E-9** | **9** phases |
| **E-Setup** | **1** recon slice (this doc + prior recon notes) |
| **Decisions E-001–E-010** | **10** decisions |

---

## Section 5 — Path A discipline

### Inherited rules ([09](./09-d-spike-ui-patterns.md))

- **Route Handlers** for mutations; **no Server Actions**.
- **`useApiFetch`** for `/api/*`; **`showToastOnError: false`** when showing inline Zod/API errors.
- **No** `@radix-ui/*`, **no** TanStack Query/SWR, **no** RTL in E unless policy changes in F.
- **Loading / empty / error** states on major screens (`definition-of-done.mdc`).

### Forbidden dependency reminder (from [09 §8](./09-d-spike-ui-patterns.md))

| Forbidden | Substitute |
| --- | --- |
| `react-hook-form`, formik | Controlled `useState` / local reducers |
| `@tanstack/react-query`, `swr` | `useApiFetch` + refresh/refetch |
| `@radix-ui/*`, shadcn CLI churn | Existing `src/components/ui/*` |
| `sonner`, `react-hot-toast` (new) | Existing toast primitive |
| Playwright/Cypress (new) | Manual QA + API tests per constitution norms |

### Server-side parity

Outbound webhooks are **high-risk infrastructure**: **tenant isolation**, **plan enforcement**, and **auditability** remain **server-authoritative** — UI mirrors **[05](./05-webhooks.md)** but never replaces enforcement (**same principle as D-Spike §3.7**).

### LOC and file budgets (E-003)

| Constraint | Value |
| --- | --- |
| **Per file** | ≤ **700** lines (soft); split components when exceeded |
| **Per phase delta** | ≤ **1500** LOC aggregate (soft; justify if spike) |

### E-5 review point (mid-MACRO-FASE E)

**When:** After **E-5** enqueue lands (or when **E-4–E-5** bundle completes — choose one checkpoint in execution).

**Evaluate:**

1. Event wiring complexity vs Path A (monolithic enqueue helper vs split modules).
2. Worker reliability vs need for structured logging/metrics.
3. Whether **Path B** (e.g. RHF for dense forms) is warranted — default **no** until F.

### Path B triggers

Mirror **[09 §4](./09-d-spike-ui-patterns.md)** signal table: multi-hundred-line forms, repeated validation bugs, stale server state after mutations, blocked UX without optimistic feedback.

---

## Section 6 — Reuse from MACRO-FASES B / C / D

| Asset | Source macro | Reuse in E |
| --- | --- | --- |
| **`WebhookEndpoint` / `WebhookDelivery` models** | **B** (schema) | CRUD + worker queries |
| **`PlanFeatures` shape + `resolveTenantPlan`** | **C / billing** | **`webhooks`** boolean (**E-001**) |
| **Route Handler + Zod patterns** | **C** | Tenant APIs (**E-3**) |
| **`BackgroundJob` + cron `/api/internal/cron/jobs`** | Existing platform | Extend job types / processor (**E-4**) |
| **`PlanGateBanner` + `isUpgradeRequiredFromApiResponse`** | **D-7** ([10](./10-macro-fase-d-summary.md)) | Gate webhook UI for non-**scale** tenants |
| **Modal / settings patterns** | **D-1b–D-6** | Endpoint editor modals (**E-6**) |
| **Workspace settings tabs** | **D** | Add **tab 7** (**E-6**) |
| **Sidebar ordering discipline** | **D-8** | Optional consistency for future nav — webhooks live under **settings**, not sidebar |

### Explicit non-reuse (E-phase)

| Area | Policy |
| --- | --- |
| **Paddle `verifyPaddleWebhookSignature`** | **Do not call** from outbound path (**E-004**) |
| **`BillingEvent` idempotency** | Separate domain; **no shared helper** with **`WebhookDelivery`** in E |
| **`workspace-directory-fetch`** | Optional for future picker UIs — **webhooks** use URL text + validation, not member directory |

### Testing inheritance

- **Integration tests** on isolation-critical enqueue/worker paths — align with **D-009** spirit ([08](./08-macro-fase-c-summary.md) / constitution).
- **UI**: manual QA per **09 §3.8** unless F-phase changes tooling.

---

## Section 7 — Inconsistencies in epic 05 to track

Authoritative spec remains **[05-webhooks.md](./05-webhooks.md)**; treat items below as **documentation drift** to fix during E (doc PRs) or acknowledge in E-9 summary.

| ID | Issue | Resolution owner |
| --- | --- | --- |
| **EU-DOC-001** | Header says implementing **Phase B/C/D** for schema/APIs/worker — **MACRO-FASE E** actually delivers CRUD/worker/UI | Update **05** header in doc sweep |
| **EU-DOC-002** | **“Enterprise”** prose vs **`scale`** code — reconciled by **E-001** | Reference **E-001** in **05** footnote |
| **EU-DOC-003** | CRUD described under historical “Phase C” — **not** in repo until **E-3** | E-9 summary cites gap closed |
| **EU-DOC-004** | **`record.approval.completed`** in E-010 vs internal event naming (`FULLY_APPROVED` etc.) — **verify** string in E-5 | Engineering reconciliation |
| **EU-DOC-005** | Dual-secret rotation note in **05 §2** vs single hash field today | Optional migration **F** |
| **EU-DOC-006** | **`07-execution-plan.md`** legacy macro letters for webhooks vs revised roadmap | Per [10 §1](./10-macro-fase-d-summary.md) |
| **EU-DOC-007** | Unique constraint **`(tenantId, eventId, endpointId)`** mentioned optional in **05 §3** — validate at E-5 migration need | Schema review |

*(IDs **EU-DOC-*** = **Epic 05 documentation tracker**, distinct from UI DU-* ids in other summaries.)*

---

## Section 8 — Handoff notes for E-1

### Start here (implementation)

1. **`PlanFeatures`** — add **`webhooks: boolean`** to **`src/server/billing/provider-types.ts`**.
2. **`PLAN_CATALOG`** — set **`webhooks: false`** for `free|starter|pro`, **`webhooks: true`** for **`scale`** in **`src/server/billing/plans/catalog.ts`**.
3. **`featuresFromCatalog` / DEFAULT_FREE_FEATURES** — extend **`resolve-tenant-plan.ts`** and defaults.
4. **Permissions** — add **`tenant.webhooks.manage`** to permission catalog + **`ROLE_PERMS`** for Owner/Admin.
5. **Seed** — ensure new permission exists in DB bootstrap paths (mirror prior gates).

### Pre-recon checklist for E-1 prompt

- Read **`05 §2`** constraints (HTTPS, SSRF, endpoint cap).
- Read **`plans-usage-billing.mdc`** / constitution for plan enforcement location (server-only).
- Confirm **`scale`** tenant in staging for manual QA.

### Non-goals in E-1

- **No** Paddle file edits.
- **No** `WebhookEndpoint` CRUD yet (**E-3**).

### Files most likely touched in E-1 (illustrative)

| File | Change |
| --- | --- |
| `src/server/billing/provider-types.ts` | Add `webhooks` to `PlanFeatures` |
| `src/server/billing/plans/catalog.ts` | Per-tier `webhooks` flag |
| `src/server/billing/resolve-tenant-plan.ts` | Map catalog + JSON fallbacks |
| `src/lib/tenant-role-permissions.ts` | New permission + role links |
| `prisma/seed` or bootstrap scripts | Permission rows if required by project pattern |

### Verification after E-1

- **`scale`** tenant: `resolveTenantPlan().features.webhooks === true`
- **Non-scale**: `false` and UI gate ready for **E-6**
- **tsc / unit / integration** non-regressing

---

## Section 9 — Changelog

| Version | Date | Summary |
| --- | --- | --- |
| **v1.0** | 2026-05-03 | Initial **E-Spike**: decisions **E-001–E-010**, Paddle zero-touch list, phases **E-1–E-9**, Path A, reuse map, **05** drift trackers |
| **v1.x** | TBD | Append rows — preserve decision history; bump version when phase boundaries change |

---

### Appendix A — Math verification

| Check | Result |
| --- | --- |
| **Phases E-1–E-9** | **9** ✓ |
| **Decisions E-001–E-010** | **10** ✓ |
| **E-Setup + E-1–E-9** | **10** checkpoints ✓ |
| **Initial event count (E-010)** | **6** events listed ✓ |

---

### Appendix B — Cross-reference index

| Need | Open |
| --- | --- |
| Payload/signing/delivery spec | [05-webhooks.md](./05-webhooks.md) |
| Path A UI rules | [09-d-spike-ui-patterns.md](./09-d-spike-ui-patterns.md) |
| D macro outcomes / PlanGate | [10-macro-fase-d-summary.md](./10-macro-fase-d-summary.md) |
| Historical macro confusion | [07-execution-plan.md](./07-execution-plan.md) §4–6 |

---

### Appendix C — Phase → primary artifact map (review aid)

| Phase | Primary artifact |
| --- | --- |
| **E-1** | Plan + permission + feature flag wiring |
| **E-2** | Outbound `signPayload` + `fetch` delivery helper (**new module**) |
| **E-3** | `src/app/api/tenant/webhook-endpoints/**` |
| **E-4** | Worker route + DB transitions |
| **E-5** | Service-layer enqueue calls |
| **E-6** | `workspace-settings-tabs.tsx` + webhook tab components |
| **E-7** | Delivery history client + API |
| **E-8** | Diagnostics route(s) |
| **E-9** | Macro summary markdown |

---

### Appendix D — Paddle path inventory (count sanity)

The following groups constitute **complete avoidance** during E unless approved:

- **4** billing route files (webhook, replay, change-plan, reconcile)
- **`providers/paddle/`** TypeScript modules (**≥9** files — grows if Paddle integration expands)
- **2** `billing/webhooks/` helpers (`persist-first`, `update-event-status`)
- **1** `billing-log.ts`
- **`paddle/**` subtree (`paddle-api`, subscriptions, transactions, customer, invoices)

**Total principle:** treat **`src/server/billing/providers/paddle/**` and **`src/server/billing/paddle/**`** as **immutable forests** for MACRO-FASE E.

---

### Appendix E — Document governance

| Rule | Description |
| --- | --- |
| **Authority** | Conflicts between this doc and **[05](./05-webhooks.md)** for **technical** delivery semantics → **05** wins; update **11** to match. |
| **Decisions** | **E-001–E-010** require explicit E-Spike revision to change — do not override in ad-hoc prompts. |
| **Paddle list** | If new Paddle-integrated files appear under `src/server/billing/`, **extend §3** in the same PR that adds them (or E-Spike patch). |
| **Phase renumbering** | If phases merge/split, bump **changelog** and **appendix A** math. |

---

*End of E-Spike foundations (`docs/epic/11-e-spike-webhooks-foundations.md`).*
