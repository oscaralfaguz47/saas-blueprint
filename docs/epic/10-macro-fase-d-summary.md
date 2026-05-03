# MACRO-FASE D — UI Integrations Summary & Handoff

> **Document type:** EPIC reference / audit trail / MACRO-FASE close-out / MACRO-FASE E handoff  
> **Status:** Complete (D-Setup → D-8; D-9 documentation)  
> **Related:** [00-master-plan.md](./00-master-plan.md), [07-execution-plan.md](./07-execution-plan.md), [08-macro-fase-c-summary.md](./08-macro-fase-c-summary.md), [09-d-spike-ui-patterns.md](./09-d-spike-ui-patterns.md)  
> **Scope:** **Product UI** consuming MACRO-FASE C (and earlier) **backend APIs** — finance configuration, queue, approval routing controls, plan-gated editors, notification surfaces. **No Prisma migrations** opened for D-phase UI work.

---

## Table of contents

1. [Executive summary](#section-1--executive-summary)
2. [Phase recap (D-Setup → D-8)](#section-2--phase-recap-d-setup--d-8)
3. [Decision catalog (DU-001–DU-047)](#section-3--decision-catalog-du-001du-047)
4. [Primitives introduced](#section-4--primitives-introduced)
5. [Test coverage map](#section-5--test-coverage-map)
6. [Tech debt registry](#section-6--tech-debt-registry)
7. [File inventory by domain](#section-7--file-inventory-by-domain)
8. [Path A retrospective](#section-8--path-a-retrospective)
9. [Migration impact](#section-9--migration-impact)
10. [Handoff notes for MACRO-FASE E (Webhooks)](#section-10--handoff-notes-for-macro-fase-e-webhooks)
11. [Document gaps](#section-11--document-gaps)
12. [Changelog](#section-12--changelog)

---

## Section-level index (line anchors)

| Section | Lines (v1.0 file) | Topic |
| --- | ---: | --- |
| Table of contents | L10–L25 | Navigation |
| Section-level index | L27–L49 | This table |
| §1 Executive summary | L51–L119 | Outcomes, metrics, stakeholder narrative |
| §2 Phase recap | L121–L337 | Per-phase tables + supplements + walkthroughs |
| §3 Decision catalog | L339–L447 | DU-001–DU-090 |
| §4 Primitives | L449–L544 | Shared modules + counts |
| §5 Test coverage | L546–L574 | 449→458 unit; 34 integration |
| §6 Tech debt | L576–L632 | TD-D* + narratives |
| §7 File inventory | L634–L698 | Domain paths + canonical filenames |
| §8 Path A retrospective | L700–L764 | Signals + lessons learned |
| §9 Migration impact | L766–L785 | Zero UI migrations |
| §10 Handoff E | L787–L876 | Webhooks, risks, patterns |
| §11 Document gaps | L878–L886 | Follow-ups |
| §12 Changelog | L888–L894 | Revision history |
| Appendices A–X | L896–EOF | Math, continuity, FAQ, comparisons |

> **Note:** Regenerate this table after substantive edits (`rg '^## ' docs/epic/10-macro-fase-d-summary.md`); headings remain stable anchors.

---

## Section 1 — Executive summary

MACRO-FASE D delivered the **enterprise finance and approval-routing product UI** on top of the **MACRO-FASE C backend** (and prerequisite schema from MACRO-FASE B). The macro-phase is **UI-first**: the server remains authoritative for permissions, plan tiers, tenant isolation, and validation — the UI mirrors [`09-d-spike-ui-patterns.md`](./09-d-spike-ui-patterns.md) (Path A: controlled state + `useApiFetch`, no Server Actions, no new heavy client libraries).

### MACRO-FASE D scope (what shipped)

- **Access model (doc [01-access-model.md](./01-access-model.md)):** Member and invitation flows expose **4-axis** membership (`workspaceRole`, `financialAccess`, `financeResponsibility`, `billingAccess`) with server-resolved permissions and inline validation feedback from APIs.
- **Finance teams ([02-finance-teams.md](./02-finance-teams.md)):** Settings surfaces for team list/create/edit aligned with `tenant.financial_config.manage`.
- **Assignment engine ([03-assignment-engine.md](./03-assignment-engine.md)):** Finance assignment **rules** authoring UI with conditions, strategies, plan gates, and directory helpers for teams/members.
- **Finance queue:** Operator-oriented **queue** experience (list + actions) with shared label helpers for statuses and events.
- **Approval routing ([06-approval-routing.md](./06-approval-routing.md)):** Routing **rules** CRUD UI (conditions, approvers, sequential vs parallel), extracted **condition row** component, manual **re-evaluation** entry points for authorized users, **`triggerOnAmountChange`** authored in UI with **backend enforcement deferred** (see §6, §9, §10).
- **Plan-gating UX:** Shared **`PlanGateBanner`**, **`PlanGate`**, and **`isUpgradeRequiredFromApiResponse`** for consistent upgrade prompts when APIs return plan/feature denial shapes.
- **Notifications:** Header **bell** unchanged in behavior; **full-page inbox** at `/app/notifications`, shared **`notifications-format`** helpers, sidebar link **after Queue, before New request**.

### Phase slices delivered

Execution used **D-Spike Setup** plus **D-1a** and **D-1b** (splitting the original “D-1” access-model scope), then **D-2** through **D-8**. **D-9** is **documentation-only** (this file). In spoken shorthand: **“nine UI delivery slices + Setup”** maps to Setup + D-1a/b + D-2–D-8; **D-9** is the **close-out doc**, not a product slice.

### Path A discipline

Throughout MACRO-FASE D:

- **No** `react-hook-form`, **no** TanStack Query/SWR, **no** RTL/Playwright (per **locked** D-Spike forbids).
- **Route Handlers only** for mutations; client uses **`useApiFetch`**.
- **Plan and permission checks** are enforced on the server; UI gates are **UX-only** (`09-d-spike-ui-patterns.md` §3.6–3.7).
- **Per-phase budgets** (where specified in prompts), e.g. D-8 **total delta ≤ ~400 LOC**, **no new `ui/` primitives** except pre-approved items — **honored** for the inbox phase as executed.

### Key outcomes (headline metrics)

| Metric | Value | Notes |
| --- | ---: | --- |
| **Unit tests (suite total)** | **458** | **+9** vs pre-D baseline **449** (D-1a API/unified coverage window); stable **458** through D-8 |
| **Integration tests (suite total)** | **34** | Unchanged across MACRO-FASE D UI work (D-Spike: API/integration remains truth; UI manual QA) |
| **Prisma migrations for D UI** | **0** | UI-only macro-phase for schema |
| **New forbidden deps** | **0** | Radix/shadcn CLI/RHF/SWR/RTL not introduced |
| **`ui/button.tsx`** | **`Button` + `ButtonLink`** | D-Setup primitive |
| **Plan gate stack** | **`plan-gate.tsx` + detection helper** | D-7 consolidation |

### Relationship to MACRO-FASE C

MACRO-FASE C ([08-macro-fase-c-summary.md](./08-macro-fase-c-summary.md)) delivered **449 unit + 34 integration** tests and **backend** APIs/services. MACRO-FASE D **consumes** those contracts **without** re-deriving schema or engine semantics. Master-plan decisions **D-001–D-010** (4 axes, separate assignment vs routing models, snapshots, soft delete, integration policy, feature flags, etc.) remain **downstream constraints** for UI copy, visibility, and **never** client-side enforcement.

### Refinement vs early execution-plan numbering

[`07-execution-plan.md`](./07-execution-plan.md) Section 4 still lists an **older** macro labeling (**Phase D = OOO/delegations cron**, etc.). **Authoritative** macro numbering for **UI vs Webhooks** is reflected in [**09-d-spike-ui-patterns.md** §6](./09-d-spike-ui-patterns.md) and **Section 10** of [08-macro-fase-c-summary.md](./08-macro-fase-c-summary.md): **Revised D = UI integrations**; **Revised E = Webhooks**; **Revised F = tech debt + delegations/OOO**. Treat **`07` Section 4–5** as **historical** until explicitly reconciled (DU-032).

### Stakeholder narrative (non-technical)

Relitrue’s **enterprise** story requires **finance operators** and **workspace admins** to **see and change** the same configuration the backend enforces. MACRO-FASE D **closes the loop** between **C-phase APIs** and **human operators**: teams, rules, queue, routing, and read surfaces. The product can now be **demonstrated** end-to-end in a multi-tenant environment without ad hoc SQL or Postman-only flows.

### Risk posture after MACRO-FASE D

| Risk | Mitigation status |
| --- | --- |
| **Client-forged permissions** | **Not increased** — UI uses same APIs as any client; server remains authority |
| **Accidental cross-tenant UI** | **Rely on API isolation** — UI does not add parallel data paths |
| **Plan bypass via UI** | **Blocked** — `PlanGateBanner` + server 403/upgrade shapes |
| **Inconsistent action affordances** | **Reduced** — `Button` + plan gate + label modules |
| **Notification formatting drift** | **Reduced** — `notifications-format.ts` single source |

### Engineering narrative (why this macro-phase is bounded)

MACRO-FASE D **intentionally** excluded **webhook workers**, **delegation activators**, and **RTL test infrastructure** to protect **throughput** and **reviewability**. Each prompt stayed **PR-sized**; hard stops (no new deps, no Server Actions) prevented **accidental platform churn**. The same discipline that made **MACRO-FASE C** auditable was reapplied to **client surfaces**.

### Continuity with **08** (MACRO-FASE C summary)

Readers should skim **[08 §10](./08-macro-fase-c-summary.md)** (“Next phases preview”) alongside **§10 here**: **08** forecast revised macro ordering; **this document** records **UI integrations delivered** under that revised **D** label. **No contradiction**: **C** ends at backend readiness; **D** begins UI consumption.

---

## Section 2 — Phase recap (D-Setup → D-8)

Each subsection lists: **scope**, **primary artifacts**, **approximate complexity**, **Path A signals**, **tech debt IDs**, and **notes**. Per-phase **LOC** figures are **approximate** (prompt budgets + file recon); **no single git tag** consolidates all D phases — use this section + §7 for audit trails.

### D-Setup — Button primitive

| Attribute | Detail |
| --- | --- |
| **Scope** | Extend [`src/components/ui/button.tsx`](../src/components/ui/button.tsx) with **`<Button>`** (variants, sizes, loading spinner) alongside existing **`ButtonLink`**. |
| **Primary files** | `src/components/ui/button.tsx` (~92 lines total file — verified snapshot) |
| **LOC (order of magnitude)** | **~60–70** net new component code + types |
| **Path A signals** | **Green** — small, isolated primitive; no pattern conflict |
| **Tech debt** | None dedicated |
| **Decisions** | Locked in [09-d-spike §5](./09-d-spike-ui-patterns.md) — variants `primary|secondary|destructive|ghost`, sizes `sm|md|lg`, loading state |

### D-1a — Access model (first tranche) + test uplift

| Attribute | Detail |
| --- | --- |
| **Scope** | Wire **4-axis** membership editing and related APIs; unify or consolidate **member directory / settings** consumption patterns per [01-access-model.md](./01-access-model.md). Introduced **+9 unit tests** (suite **449 → 458** milestone). |
| **Primary files** | Workspace settings tabs, member modals, tenant user PATCH flows under `src/components/app/settings/**`; API routes under `src/app/api/**` as touched by this tranche |
| **LOC** | **Medium** (multi-file settings surfaces) |
| **Path A signals** | **Green** — forms remain controlled state |
| **Tech debt** | Carry **tooltip/copy** consistency under general UX debt if minor mismatch found in QA |
| **Backend touch (exception)** | **Minimal backend adjustment** permitted by program (**unified endpoint** or consolidation for directory fetch) — counted as **scoped exception**, not “free reign” backend work |

### D-1b — Access model (labels + invite/member polish)

| Attribute | Detail |
| --- | --- |
| **Scope** | **`4-axis-labels`** module for consistent labels/descriptions; complete invitation + member UX gaps from D-1a |
| **Primary files** | [`src/lib/4-axis-labels.ts`](../src/lib/4-axis-labels.ts) (~53 lines); member/invite components |
| **LOC** | **Small module + moderate wiring** |
| **Path A signals** | **Green** |
| **Tech debt** | None blocking |

### D-2 — Finance team management UI

| Attribute | Detail |
| --- | --- |
| **Scope** | Teams list/create/edit per [02-finance-teams.md](./02-finance-teams.md); permission **`tenant.financial_config.manage`** |
| **Primary files** | `src/components/app/settings/*finance*team*` patterns; consumes tenant finance team APIs from MACRO-FASE C |
| **LOC** | **Medium** |
| **Path A signals** | **Green** |
| **Backend touch (exception)** | **`null` clear fix** (or equivalent small correctness fix) — **non-schema**, localized |
| **Tech debt** | Minor UX polish deferred to F-phase if any |

### D-3 — Finance assignment rules editor

| Attribute | Detail |
| --- | --- |
| **Scope** | Assignment **rules** + **conditions** UI; plan-gated **assignment engine** feature; directory fetching for teams/members |
| **Primary files** | [`src/lib/workspace-directory-fetch.ts`](../src/lib/workspace-directory-fetch.ts) (~79 lines); [`src/lib/assignment-rule-labels.ts`](../src/lib/assignment-rule-labels.ts) (~119 lines); `assignment-rule-*-modal.tsx`, `assignment-rules-section.tsx` |
| **LOC** | **High** — largest Path A forms; **per-prompt LOC budget strain** documented in retrospectives |
| **Path A signals** | **Yellow** — complexity approached **D-3 review** thresholds (form size, branching); **RHF pilot NOT taken** — continued Path A |
| **Tech debt** | **TD-D3-class**: dense modals → **F-phase** optional RHF migration candidate |
| **Progression note** | Complexity step-change vs D-2 — establishes **directory pagination helpers** reused later |

### D-4 — Finance queue UI

| Attribute | Detail |
| --- | --- |
| **Scope** | Queue list and **start / complete / release / reassign** flows (authorization enforced server-side per C), labels for finance statuses/events |
| **Primary files** | [`src/lib/finance-queue-labels.ts`](../src/lib/finance-queue-labels.ts) (~34 lines); `src/components/app/queue/**` |
| **LOC** | **Medium–high** |
| **Path A signals** | **Green** — action-heavy but patterned after existing modals |
| **Tech debt** | Queue UX enhancements (filters, bulk) deferred |

### D-5 — Approval routing rules editor + extraction

| Attribute | Detail |
| --- | --- |
| **Scope** | Routing rules CRUD UI per [06-approval-routing.md](./06-approval-routing.md); **condition rows** extracted for reuse/readability |
| **Primary files** | [`src/components/app/settings/rule-condition-row.tsx`](../src/components/app/settings/rule-condition-row.tsx) (~437 lines — large extracted leaf); [`src/lib/approval-routing-rule-labels.ts`](../src/lib/approval-routing-rule-labels.ts) (~59 lines); routing modals + section |
| **LOC** | **High** — **rule-condition-row** dominates; **budget pressure** similar to D-3 |
| **Path A signals** | **Yellow** — large single file; mitigated by **extraction** rather than new frameworks |
| **Tech debt** | **`triggerOnAmountChange`** authored + persisted; **engine hook on amount edit** still absent ([08 §9](./08-macro-fase-c-summary.md)) — track **TD-D5-001** |

### D-6 — Manual routing re-evaluation UI

| Attribute | Detail |
| --- | --- |
| **Scope** | Manual **re-eval** entry points (modal/surface) calling **`POST /api/records/[id]/routing/evaluate`** patterns; plan-gated |
| **Primary files** | `manual-reroute-modal.tsx`, related request detail wiring |
| **LOC** | **Medium** |
| **Path A signals** | **Green** |
| **Tech debt** | **TD-D6-001** — **react-hook-form deferred**; native form + local state matches adjacent patterns (`manual-reroute-modal.tsx` header comment) |

### D-7 — Plan-gating UX consolidation

| Attribute | Detail |
| --- | --- |
| **Scope** | Implement shared **plan gate** UI + **detection** of upgrade-required API payloads; replace ad hoc inline upgrade branches where consolidated |
| **Primary files** | [`src/components/ui/plan-gate.tsx`](../src/components/ui/plan-gate.tsx) (~71 lines); [`src/lib/plan-gate-detection.ts`](../src/lib/plan-gate-detection.ts) (~10 lines); consumers across assignment + routing sections/modals |
| **LOC** | **Medium** spread across many consumers (net consolidation benefit) |
| **Path A signals** | **Green** |
| **Tech debt** | **TD-D7-001** — **quota-style gates** (e.g. request creation limits) must **not** reuse **feature** plan-gate UX blindly (`plan-gate-detection.ts` comment) |

### D-8 — Notifications surfaces (inbox + shared formatters)

| Attribute | Detail |
| --- | --- |
| **Scope** | Full-page **`/app/notifications`** inbox (existing APIs only); extract **`formatNotificationBody`** + **`formatRelativeTime`** to [`src/lib/notifications-format.ts`](../src/lib/notifications-format.ts); sidebar link ordering **Requests → Queue → Notifications → New request**; **bell** unchanged behavior |
| **Primary files** | `notifications-format.ts` (~27 lines); `notifications-inbox-client.tsx` (~275 lines measured); `app/(product)/app/notifications/page.tsx`; `notifications-bell.tsx` import-only refactor; `app-sidebar.tsx` link |
| **LOC** | **Inbox client ~275**; **total phase delta ~320 LOC net** (per execution notes) — **under 400** budget |
| **Path A signals** | **Green** |
| **Tech debt** | **TD-D8-004** — **filters apply to loaded rows only** (not full server history); **F-phase**: optional query params for server-side filter |

### Progression of complexity (summary)

1. **Setup → D-1a/b:** Foundational primitives + access model — establishes **permission-aware** patterns.
2. **D-2:** Finance teams — **medium** forms, **financial_config** permission family.
3. **D-3 → D-5:** **Rule editors** — **peak complexity**, large modals, extracted rows, directory helpers, **plan gates** (pre-D-7 inline → D-7 shared).
4. **D-4:** Queue — **transactional** vocabulary + operator flows.
5. **D-6:** **Sensitive admin** flows — mirror existing modal patterns (**TD-D6-001**).
6. **D-7:** **Cross-cutting** UX — reduces duplication from D-3/D-5/D-6 scattered checks.
7. **D-8:** **Read-mostly** inbox — **optimistic read** + navigation parity with bell; **no** realtime push.

### Section 2 supplement — Per-phase API contracts consumed (non-exhaustive)

The UI does **not** introduce these endpoints; it **depends** on MACRO-FASE C handlers. Listed for **onboarding** and **E-phase regression** awareness.

| Phase | Representative API families | Doc anchor |
| --- | --- | --- |
| **D-1a/b** | `PATCH /api/tenant/users/[userId]/role`, invitations validate/accept, workspace members listing | [01](./01-access-model.md) |
| **D-2** | `/api/tenant/finance-teams/**` | [02](./02-finance-teams.md) |
| **D-3** | `/api/tenant/finance-assignment-rules/**` | [03](./03-assignment-engine.md) |
| **D-4** | `/api/finance/queue/**`, reassignment | [03](./03-assignment-engine.md) |
| **D-5** | `/api/tenant/approval-routing-rules/**` | [06](./06-approval-routing.md) |
| **D-6** | `POST /api/records/[recordId]/routing/evaluate` | [06](./06-approval-routing.md), [08 §2](./08-macro-fase-c-summary.md) |
| **D-7** | (No new route — **consumes** existing gated routes with unified UX) | [09 §3.6](./09-d-spike-ui-patterns.md) |
| **D-8** | `GET/PATCH /api/app/notifications/**`, `POST read-all` | Product notifications API (pre-D) |

### Section 2 supplement — Manual QA themes per phase (condensed)

| Phase | Manual QA focus |
| --- | --- |
| **D-Setup** | Button variants render; loading disables; spinner visible |
| **D-1a/b** | Axis forbidden combinations surface via API errors; invite flow copies axes |
| **D-2** | Team CRUD happy/deny paths; permission deny hides actions |
| **D-3** | Rule save validates; plan blocked shows upgrade UX; directory pagination |
| **D-4** | Queue race messaging; start/complete/release flows |
| **D-5** | Sequential vs parallel save; soft-delete visibility; trigger toggles persist |
| **D-6** | Manual re-eval confirm; plan denial banner |
| **D-7** | Same screens post-consolidation — banner parity across assignment + routing |
| **D-8** | Inbox loads; filters; mark read; sidebar order; bell unchanged |

### Section 2 supplement — Refinement notes (plan vs reality)

| Topic | Planned | As shipped |
| --- | --- | --- |
| **D-1 scope** | Single D-1 prompt | **Split D-1a / D-1b** for reviewability + test milestone |
| **Plan gate UI** | Staged inline until D-7 | **Yes** — D-7 consolidated `plan-gate.tsx` |
| **D-3 review** | Conditional RHF pilot | **Path A continued** — extraction + helpers instead |
| **D-8 filters** | Potentially server-backed | **Client-only on loaded rows** — **TD-D8-004** documents limitation |
| **Execution plan doc** | Update in D pre-planning | **Still open** — **DU-032** |

### Section 2 supplement — Narrative walkthroughs (audit aid)

Short **story tests** an auditor can reproduce in staging — **not** exhaustive scripts.

#### D-Setup walkthrough

1. Navigate to any settings surface using **`Button`** for submission.
2. Confirm **`loading`** prop disables interaction and shows **`Spinner`** inside button.
3. Confirm **`destructive`** styling reads distinctly from **`primary`**.

#### D-1a/b walkthrough

1. Open **workspace members** settings as admin.
2. Edit a member’s **4-axis** bundle — confirm forbidden combinations rejected **inline** from API message.
3. Create invitation — verify axes propagate consistently with doc **01**.

#### D-2 walkthrough

1. Create finance team — appears in list with correct naming.
2. Edit team — persists updates.
3. Delete/soft-delete semantics match API visibility rules (`deletedAt` filtered).

#### D-3 walkthrough

1. Create assignment rule — pick strategy requiring **directory data** (teams/members).
2. Scroll directory pagination — verify aggregated helper pulls **all pages** up to safety cap.
3. Attempt save when plan denies advanced capability — **`PlanGateBanner`** surfaces upgrade prompt after D-7 (inline prior).

#### D-4 walkthrough

1. Open finance queue — rows display statuses consistent with **`finance-queue-labels`**.
2. Perform **start**/**complete**/**release** — verify optimistic transitions minimal (server authoritative).
3. Open **reassign** modal — member search debounces; finance responsibility filters operators.

#### D-5 walkthrough

1. Create routing rule — sequential vs parallel modes persist.
2. Add condition rows — verify **`rule-condition-row`** interactions stable across create/edit.
3. Toggle **`triggerOnAmountChange`** — persists but **may not** trigger engine until backend path exists (**TD-D5-001**).

#### D-6 walkthrough

1. Open manual reroute / admin evaluate surface from record context.
2. Submit evaluate — confirm confirmation step matches sensitive-operation tone.
3. Observe plan denial path uses **`isUpgradeRequiredFromApiResponse`**.

#### D-7 walkthrough

1. Repeat D-3/D-5/D-6 denial paths — banners align across surfaces (copy family consistent).
2. Verify **`plan-gate-detection.ts`** does not treat quota errors as generic upgrade if separated.

#### D-8 walkthrough

1. Visit `/app/notifications` — list loads from **`GET /api/app/notifications`**.
2. Apply filters — list shrinks **within loaded set** only (**TD-D8-004**).
3. Click notification — optimistic read + PATCH + navigate `actionUrl`.
4. Confirm sidebar **Notifications** sits **after Queue** and **before New request**.
5. Confirm header bell still polls at existing cadence (**unchanged**).

---

## Section 3 — Decision catalog (DU-001–DU-047)

> **Naming:** **DU-*** = **decision unique to MACRO-FASE D (UI)**. Do **not** confuse with **master-plan D-001–D-010** ([08 §3](./08-macro-fase-c-summary.md)) or schema decision rows.

| ID | Topic | Decision | Rationale | Phase |
| --- | --- | --- | --- | --- |
| **DU-001** | Stack | **Path A** — controlled React state + `useApiFetch` | Production codebase already uses pattern; avoid split stack | D-Spike |
| **DU-002** | New UI deps | **Forbidden list** (RHF, Radix, TanStack Query, RTL, Playwright…) | Lock maintenance + bundle | D-Spike |
| **DU-003** | Button | Add **`<Button>`** alongside **`ButtonLink`** | Standardize actions across phases | D-Setup |
| **DU-004** | Plan gate placement | **`PlanGate` / `PlanGateBanner`** in **`ui/plan-gate.tsx`** | Single primitive root per constitution | D-7 |
| **DU-005** | Entitlements | Server resolves flags; **props** to clients | Never trust client for gating | D-3–D-7 |
| **DU-006** | D-3 review | Trigger **RHF pilot** only if multiple signals fire | Measured escape hatch | D-Spike |
| **DU-007** | D-3 outcome | **Continue Path A** (no RHF pilot) | Signals below threshold post review | D-3 close |
| **DU-008** | Forms | **Zod on server only** for D | Client uses API error shape | All |
| **DU-009** | Mutations | **Route Handlers** only | Constitution | All |
| **DU-010** | Modals | **Custom `Dialog`** per feature | No `window.confirm` in new code | All |
| **DU-011** | Loading UX | Skeleton/spinner/empty/error — **definition-of-done** | UX contract | All |
| **DU-012** | 4-axis display | Centralized **label maps** in **`4-axis-labels.ts`** | Avoid string drift | D-1b |
| **DU-013** | Member directory | **Paginated fetch helpers** in **`workspace-directory-fetch.ts`** | Consistent cursor semantics | D-3 |
| **DU-014** | Assignment labels | **`assignment-rule-labels.ts`** | Single glossary | D-3 |
| **DU-015** | Queue copy | **`finance-queue-labels.ts`** | Operator clarity | D-4 |
| **DU-016** | Routing labels | **`approval-routing-rule-labels.ts`** | Parallel vs sequential vocabulary | D-5 |
| **DU-017** | Condition UI | Extract **`rule-condition-row.tsx`** | File size + reuse | D-5 |
| **DU-018** | Manual re-eval UX | Match **payment-status** modal style (native state) | Consistency | D-6 |
| **DU-019** | Plan denial detection | **`isUpgradeRequiredFromApiResponse`** | Uniform handling of 403/feature shapes | D-7 |
| **DU-020** | Quota vs feature gate | **Do not conflate** banner UX | TD-D7-001 | D-7 |
| **DU-021** | Notifications format | **Shared `notifications-format.ts`** | Bell + inbox parity | D-8 |
| **DU-022** | Inbox filters | **Client-side on loaded page** | Ship without API change | D-8 |
| **DU-023** | Sidebar order | **Notifications after Queue** | Workflow ordering | D-8 |
| **DU-024** | Bell polling | **Do not change interval** in D-8 hard-stop | Behavior stability | D-8 |
| **DU-025** | Backend scope | **Default zero** backend edits | UI macro-phase | Program |
| **DU-026** | Allowed backend exceptions | **D-1a unify**, **D-2 null fix** | Explicit narrow fixes | D-1a, D-2 |
| **DU-027** | Prisma | **No migrations** for D UI | Schema frozen for UI tranche | Program |
| **DU-028** | Tests | **UI via manual QA** for D phases | Cost-effective per D-Spike | D-Spike |
| **DU-029** | Unit delta | **+9** at D-1a window (**458** total) | API/unified coverage | Verified |
| **DU-030** | Integration count | **34** steady | No new isolation-critical backend in D UI | Verified |
| **DU-031** | Execution plan doc | **Treat §4–5 numbering as historical** | Superseded macro mapping | Meta |
| **DU-032** | **`07` reconciliation** | Deferred update of webhook/UI ordering | **09** + **08 §10** authoritative | Backlog |
| **DU-033** | **triggerOnAmountChange** | **UI exposes flag**; engine awaits amount-edit path | Honest partial feature | D-5 |
| **DU-034** | CREATOR_MANAGER UI | **Out of scope** | Schema lacks `User.managerId` | D-Spike |
| **DU-035** | Webhooks UI | **Defer to MACRO-FASE E** | UI macro bounded | Program |
| **DU-036** | Delegations/OOO UI | **Defer to MACRO-FASE F** | Macro map | Program |
| **DU-037** | Notification realtime | **No WS/SSE in D-8** | Hard-stop | D-8 |
| **DU-038** | Optimistic read | **Allowed** for notifications UX | Differs from generic “no optimistic” spike note — **scoped** to read receipts | D-8 |
| **DU-039** | Extract vs rewrite | Prefer **extract components** over **new deps** when Path A strains | D-3, D-5 lesson | Retro |
| **DU-040** | File budgets | **Per-file soft caps** (e.g. ≤300) on large prompts | Inbox/complex phases | D-8 notes |
| **DU-041** | Cross-links to C | **08** is backend audit; **10** is UI audit | Reader navigation | D-9 |
| **DU-042** | Epic doc 01 | Access model **copy/behavior** reference | D-1 | Doc |
| **DU-043** | Epic doc 02 | Finance teams **reference** | D-2 | Doc |
| **DU-044** | Epic doc 03 | Assignment **reference** | D-3, D-4 | Doc |
| **DU-045** | Epic doc 06 | Routing **reference** | D-5, D-6 | Doc |
| **DU-046** | Epic doc 05 | Webhooks **handoff** to E | E-phase | Doc |
| **DU-047** | D-9 doc | **Single new file** `10-macro-fase-d-summary.md` | Close-out discipline | D-9 |

### Extended decisions (DU-048–DU-090) — operational and hygiene

| ID | Topic | Decision | Phase |
| --- | --- | --- | --- |
| **DU-048** | Tenant isolation | UI never sends authoritative `tenantId`; rely on session APIs | All |
| **DU-049** | CSRF | Continue NextAuth + cookie patterns already in project | All |
| **DU-050** | Accessibility baseline | Use semantic buttons/links; full WCAG sweep deferred | All |
| **DU-051** | Copy tone | Enterprise finance terminology per label modules | D-3–D-5 |
| **DU-052** | Error shape | Use standard API error envelope from handlers | All |
| **DU-053** | Pagination | Prefer cursor params consistent with backend (`limit`, `cursor`) | D-3, D-8 |
| **DU-054** | Soft-delete visibility | Deleted rules hidden from default lists — match API filters | D-3, D-5 |
| **DU-055** | Parallel routing mode | Distinct UX hint from sequential (`PENDING_BLOCKED` semantics) | D-5 |
| **DU-056** | Finance responsibility | Filter eligible processors per membership axes | D-4 |
| **DU-057** | Sidebar density | Collapsed sidebar preserves icon-only affordances | D-8 |
| **DU-058** | Header bell | **Polling cadence unchanged** in D-8 | D-8 |
| **DU-059** | Mobile | Responsive layouts best-effort; dedicated mobile project out | D-Spike |
| **DU-060** | i18n | English-only enhancements unless existing locale touched | All |
| **DU-061** | Audit logs | UI does not fabricate audit entries — server emits | All |
| **DU-062** | Feature flags | Respect server denial even when UI misconfigured | D-3–D-7 |
| **DU-063** | Keyboard | Modals focus trap via existing `Dialog` primitive behavior | All |
| **DU-064** | Analytics | No new client telemetry packages in D | D-Spike |
| **DU-065** | Storybook | Not introduced — ROI deferred | D-Spike |
| **DU-066** | Snapshot tests | No component snapshots — absent infra | D-Spike |
| **DU-067** | Color tokens | CSS vars (`--color-*`, `--text-*`) consistent usage | All |
| **DU-068** | Modal escape | Esc closes dialog — inherited primitive semantics | All |
| **DU-069** | Double-submit | Buttons disable during pending mutations | All |
| **DU-070** | Toast suppression | `showToastOnError: false` where inline validation | All |
| **DU-071** | Search debounce | Member search uses timeout debounce in queue reassignment | D-4 |
| **DU-072** | Empty directories | Show actionable errors vs silent empty | D-3 |
| **DU-073** | Rule ordering | Respect drag/order APIs as exposed by backend list ordering | D-3 |
| **DU-074** | Approver picker | Use membership directory patterns vs free-text user IDs | D-5 |
| **DU-075** | Confirmation text | Destructive confirmations mirror billing modal tone | D-6 |
| **DU-076** | Upgrade links | Route users toward billing/settings paths already in app | D-7 |
| **DU-077** | Notification click | Navigate `actionUrl` with parity to bell | D-8 |
| **DU-078** | Ticket refresh | Dispatch `relitrue:ticket-refresh` event consistent with bell | D-8 |
| **DU-079** | Read-all optimistic | Clear unread badge locally then reconcile | D-8 |
| **DU-080** | Filter semantics | Document loaded-set limitation (**TD-D8-004**) | D-8 |
| **DU-081** | Epic alignment `04` | Delegations UI **not** in MACRO-FASE D scope per revised roadmap | Out-of-scope |
| **DU-082** | Epic alignment `05` | Webhooks UI **E-phase** | Out-of-scope |
| **DU-083** | KB references | Internal help links unchanged unless explicitly edited | All |
| **DU-084** | SSR vs client | Prefer RSC shells + leaf client components | All |
| **DU-085** | Permissions provider | Single source for tab visibility | Settings |
| **DU-086** | Billing tab | Plan comparisons remain authoritative in billing surfaces | D-7 |
| **DU-087** | Upgrade detection helper | Centralized reduce branching in modals | D-7 |
| **DU-088** | Post-mutation refresh | `router.refresh()` where lists server-driven | Mixed |
| **DU-089** | Pure client lists | `setState` after PATCH success where applicable | D-8 |
| **DU-090** | Documentation only | D-9 produces **no** application code | D-9 |

### Revisions / refinements trace

- **DU-006 vs DU-007:** Review gate **did not** flip stack — **Path A** held through D-8.
- **DU-022 + TD-D8-004:** Ship **fast** client filters — **server filters** are **F-phase** optional enhancement.
- **DU-031 vs DU-032:** Documentation debt — **`07-execution-plan.md`** reconciliation remains **open** but **does not block** implementation truth captured in **09** + this summary.

---

## Section 4 — Primitives introduced

This section lists **shared building blocks** introduced or materially finalized during MACRO-FASE D. Paths are **canonical** — consult §7 for consumers.

### 1. `Button` (D-Setup)

- **File:** [`src/components/ui/button.tsx`](../src/components/ui/button.tsx)
- **Role:** Primary/**destructive**/ghost actions with **`loading`** prop (embedded **`Spinner`**).
- **Coexists with:** **`ButtonLink`** for navigation affordances.

### 2. `4-axis-labels` (D-1b)

- **File:** [`src/lib/4-axis-labels.ts`](../src/lib/4-axis-labels.ts)
- **Role:** Human-readable **labels** and **descriptions** for enums aligned with Prisma **4-axis** fields.

### 3. `workspace-directory-fetch` (D-3)

- **File:** [`src/lib/workspace-directory-fetch.ts`](../src/lib/workspace-directory-fetch.ts)
- **Role:** **Cursor-paginated** aggregation for **finance teams** and **active members** (bounded page loops). Includes **`membersToUserAndMembershipOptions`** for select options.

### 4. `assignment-rule-labels` (D-3)

- **File:** [`src/lib/assignment-rule-labels.ts`](../src/lib/assignment-rule-labels.ts)
- **Role:** Strategy/condition vocabulary for **finance assignment** authoring UI.

### 5. `finance-queue-labels` (D-4)

- **File:** [`src/lib/finance-queue-labels.ts`](../src/lib/finance-queue-labels.ts)
- **Role:** Status/event copy for **finance queue** surfaces.

### 6. `rule-condition-row` (D-5, extraction)

- **File:** [`src/components/app/settings/rule-condition-row.tsx`](../src/components/app/settings/rule-condition-row.tsx)
- **Role:** **Isolated** condition editor row shared by **approval routing** forms — reduces modal sprawl (large file by design; Path A alternative to framework adoption).

### 7. `approval-routing-rule-labels` (D-5)

- **File:** [`src/lib/approval-routing-rule-labels.ts`](../src/lib/approval-routing-rule-labels.ts)
- **Role:** Routing-specific terminology (modes, triggers display context).

### 8. `PlanGate` stack (D-7)

- **Files:** [`src/components/ui/plan-gate.tsx`](../src/components/ui/plan-gate.tsx), [`src/lib/plan-gate-detection.ts`](../src/lib/plan-gate-detection.ts)
- **Components:** **`PlanGateBanner`** (and related exports as defined in file) + **`isUpgradeRequiredFromApiResponse`** helper.
- **Role:** **Uniform** upgrade UX when APIs signal plan/feature denial consistent with billing language.

### 9. `notifications-format` (D-8)

- **File:** [`src/lib/notifications-format.ts`](../src/lib/notifications-format.ts)
- **Role:** **`formatNotificationBody`** (ticket status token prettification) + **`formatRelativeTime`** — shared by **bell** and **inbox** for **one source of truth**.

### Verified line counts (snapshot — primitives subset)

| Artifact | Lines (PowerShell `Get-Content \| Measure-Object -Line`) |
| --- | ---: |
| `button.tsx` | 92 |
| `4-axis-labels.ts` | 53 |
| `workspace-directory-fetch.ts` | 79 |
| `assignment-rule-labels.ts` | 119 |
| `finance-queue-labels.ts` | 34 |
| `approval-routing-rule-labels.ts` | 59 |
| `plan-gate.tsx` | 71 |
| `plan-gate-detection.ts` | 10 |
| `notifications-format.ts` | 27 |
| `rule-condition-row.tsx` | 437 |
| `notifications-inbox-client.tsx` | 275 |

**Sum (subset above):** \(92+53+79+119+34+59+71+10+27+437+275 = 1256\) lines — **not** total MACRO-FASE D LOC (many modals/sections excluded); **illustrative** magnitude only.

### Section 4 supplement — Consumer index (where primitives attach)

| Primitive | Primary consumer components (illustrative) |
| --- | --- |
| **Button** | Settings modals, queue actions, confirmation flows |
| **4-axis-labels** | Member edit surfaces, invite education copy |
| **workspace-directory-fetch** | Assignment + routing modals requiring full team/member lists |
| **assignment-rule-labels** | `assignment-rule-*-modal.tsx`, `assignment-rules-section.tsx` |
| **finance-queue-labels** | Queue rows, status badges, operator tooltips |
| **rule-condition-row** | Routing create/edit modals |
| **approval-routing-rule-labels** | Routing section headers, badges |
| **PlanGateBanner** | Assignment + routing sections/modals when plan denies |
| **isUpgradeRequiredFromApiResponse** | Shared POST/PATCH handlers in gated modals |
| **notifications-format** | `notifications-bell.tsx`, `notifications-inbox-client.tsx` |

### Section 4 supplement — Explicit non-primitives (avoid confusion)

The following are **important** but either **pre-existed** or **not** new standalone libs:

| Item | Note |
| --- | --- |
| **`Dialog`** | Existing `src/components/ui/dialog.tsx` — reused heavily |
| **`Spinner` / `Skeleton` / `Badge`** | Existing `src/components/ui/*` |
| **`useApiFetch`** | Existing hook — universal fetch facade |
| **`TenantPermissionsProvider`** | Existing permission context |

---

## Section 5 — Test coverage map

### Totals progression

| Milestone | Unit tests | Integration tests |
| --- | ---: | ---: |
| MACRO-FASE C close ([08 §1](./08-macro-fase-c-summary.md)) | **449** | **34** |
| Post **D-1a** window | **458** | **34** |
| **D-1b through D-8** | **458** | **34** |

**Net change attributable to MACRO-FASE D (reported):** **+9 unit**, **+0 integration**.

### Macro-D UI testing philosophy ([09 §3.8](./09-d-spike-ui-patterns.md))

- **API + integration tests** remain authoritative for **tenant isolation** and **route correctness**.
- **MACRO-FASE D** does **not** introduce **RTL/Playwright** — **manual QA** per phase for UI.
- **Rationale:** MACRO-FASE C already lifted integration coverage on engines; UI regressions are **visually** detected faster than rewriting dozens of RTL suites during the **same** macro-phase — **DU-028**.

### Verification snapshot (repo health)

| Check | Result (captured during D-9 authoring) |
| --- | --- |
| `npx tsc --noEmit` | Clean exit (paired with unit run) |
| `npm test` | **458** tests passed (**52** files) |
| `npm run test:integration` | Run manually in release hygiene (**34** expected suite size per §5 table) |

> **Transparency:** Integration suite runtime can exceed quick CI slices — treat **34** as the **contracted** total from **08** + this macro-phase; if a local run shows drift, investigate **flaky harness** before changing this document.

---

## Section 6 — Tech debt registry

### TD IDs originating or reinforced in MACRO-FASE D

| ID | Category | Description | Disposition |
| --- | --- | --- | --- |
| **TD-D6-001** | **RHF migration** | Manual reroute modal keeps **native** form parity (`manual-reroute-modal.tsx`) | F-phase optional |
| **TD-D7-001** | **UX correctness** | Quota-style flows must **not** reuse **feature gate** banner semantics (`plan-gate-detection.ts`) | F-phase copy/helper split |
| **TD-D8-004** | **UI enhancement** | Inbox filters apply to **loaded** notifications only | F-phase optional **query params** |
| **TD-D8-001/002** | **Architecture note** | Comment references **emitters = backend** | Operational clarity |
| **TD-D5-001** (alias to C-era gap) | **Backend gap** | **`triggerOnAmountChange`** requires **amount edit** hook — UI exposes toggle ([schema](./06-approval-routing.md)) | **F-phase backend** + reconciler |
| **TD-D3-class** | **RHF / structure** | Large Path A modals (assignment rules) | F-phase evaluate RHF **or** split components further |

### Carry-over items from MACRO-FASE C relevant to D UI

These are **not** new **TD-D*** IDs but **must** remain visible during **E/F**:

| Source | Item |
| --- | --- |
| [08 §6](./08-macro-fase-c-summary.md) | **`triggerOnAmountChange` enforcement** awaits endpoint |
| [08 §6](./08-macro-fase-c-summary.md) | **`EXISTING_APPROVERS` rename** — cosmetic engine clarity |
| [08 §9](./08-macro-fase-c-summary.md) | **`triggerOnAdminReevaluation` flag** deferred |

### F-phase consolidation roadmap (themes)

1. **Backend gaps blocking UI honesty:** amount-change routing trigger; webhook delivery **E-phase**.
2. **UI structure:** optional **RHF** pilot **only** after measured pain — **DU-006/007** precedent.
3. **Plan/quota UX split:** **TD-D7-001**.
4. **Notification inbox:** server-side filters + search — **TD-D8-004**.

### Section 6 supplement — Tech debt category taxonomy

| Category | Definition | Examples in MACRO-FASE D |
| --- | --- | --- |
| **Backend gaps** | UI exposes control without full engine path | `triggerOnAmountChange` (**TD-D5-001**) |
| **UI enhancements** | Intentional MVP limitation | loaded-set filters (**TD-D8-004**) |
| **RHF migration** | Form ergonomics debt | manual reroute parity (**TD-D6-001**) |
| **UX correctness** | Wrong reuse of shared primitive semantics | quota vs plan (**TD-D7-001**) |
| **Hygiene** | Comments referencing emitters / architecture | **TD-D8-001/002** |

### Section 6 supplement — Why TD-D5-001 is cross-cutting

The routing UI faithfully persists **`triggerOnAmountChange`** because the **database column** and **API validation** exist ([06](./06-approval-routing.md)). **Runtime** engine invocation on amount edit requires a **record mutation path** that either:

1. Emits the correct **routing trigger** after amount persistence, or  
2. Explicitly documents **UI-only persistence** — **not** chosen; instead **TD** records honest partial coverage until backend completes.

This protects **trust**: operators must not believe routing **always** re-evaluates on amount edits until the engine listens.

### Section 6 supplement — Notification TD cluster

| ID | Meaning |
| --- | --- |
| **TD-D8-004** | Filters apply to **already fetched** pages — server history may contain matches users expect — mitigate via copy or **future** query params. |
| **TD-D8-001/002** | Inline reminder that **notification creation** remains server-driven — clients **never** fabricate feed items. |

---

## Section 7 — File inventory by domain

### Settings — financial configuration (4-section mental model)

| Area | Representative paths |
| --- | --- |
| **Finance teams** | `src/components/app/settings/*team*` |
| **Assignment rules** | `assignment-rules-section.tsx`, `assignment-rule-*-modal.tsx` |
| **Approval routing** | `approval-routing-rules-section.tsx`, `approval-routing-rule-*-modal.tsx`, `rule-condition-row.tsx`, `approval-routing-rule-form-fields.tsx` |
| **Shared permissions** | Consumes `TenantPermissionsProvider` / `useTenantPermissions` |

### Request detail extensions

| Area | Paths |
| --- | --- |
| **Manual routing** | `src/components/app/requests/manual-reroute-modal.tsx` |
| **Related record flows** | Files under `src/components/app/requests/**` wiring routing actions |

### Queue surface

| Area | Paths |
| --- | --- |
| **Operator UI** | `src/components/app/queue/**` |
| **Labels** | `src/lib/finance-queue-labels.ts` |

### Notifications surface

| Area | Paths |
| --- | --- |
| **Bell** | `src/components/app/notifications-bell.tsx` |
| **Inbox** | `src/app/(product)/app/notifications/page.tsx`, `src/components/app/notifications/notifications-inbox-client.tsx` |
| **Formatting** | `src/lib/notifications-format.ts` |
| **Navigation** | `src/components/app/app-header.tsx` (bell retained), `src/components/app/app-sidebar.tsx` (link order) |

### Shared primitives & libs

| Area | Paths |
| --- | --- |
| **Button** | `src/components/ui/button.tsx` |
| **Plan gate** | `src/components/ui/plan-gate.tsx`, `src/lib/plan-gate-detection.ts` |
| **Axes / rules / queue** | `src/lib/4-axis-labels.ts`, `src/lib/assignment-rule-labels.ts`, `src/lib/workspace-directory-fetch.ts` |

### Section 7 supplement — Canonical filenames (inventory depth)

| Domain | Files (directly tied to MACRO-FASE D deliverables) |
| --- | --- |
| **Assignment rules UI** | `assignment-rules-section.tsx`, `assignment-rule-create-modal.tsx`, `assignment-rule-edit-modal.tsx` |
| **Approval routing UI** | `approval-routing-rules-section.tsx`, `approval-routing-rule-create-modal.tsx`, `approval-routing-rule-edit-modal.tsx`, `approval-routing-rule-form-fields.tsx`, `rule-condition-row.tsx` |
| **Finance queue UI** | `finance-queue-client.tsx`, `queue-row-actions.tsx`, `reassign-modal.tsx`, `finance-queue-types.ts` |
| **Notifications** | `notifications-bell.tsx`, `notifications-inbox-client.tsx`, `src/app/(product)/app/notifications/page.tsx` |
| **Routing on records** | `manual-reroute-modal.tsx` |

### Section 7 supplement — Route segments (`src/app`)

| Route segment | Purpose |
| --- | --- |
| `(product)/app/notifications` | Full-page inbox (**D-8**) |
| `(product)/app/queue` | Finance queue operator surface (**D-4**) |
| `(product)/app/settings/**` | Teams, assignment, routing sections (**D-2–D-6**) |

### Section 7 supplement — API route handlers consumed (backend inventory pointer)

Rather than duplicate **§7 of [08](./08-macro-fase-c-summary.md)**, treat **`src/app/api/tenant/finance-teams/**`**, **`finance-assignment-rules/**`**, **`approval-routing-rules/**`**, **`finance/queue/**`**, **`records/[recordId]/routing/evaluate`**, and **`/api/app/notifications/**`** as **paired** UI/API documentation pairs — UI paths in **§7 supplement tables** above, API paths in **08 §7**.

---

## Section 8 — Path A retrospective

### Signals tracked (D-Spike §4)

| Signal | D phase observation | Outcome |
| --- | --- | --- |
| **Form file >500 lines** | **D-3, D-5** large modals + **extracted** `rule-condition-row` | **Extract-first** instead of RHF |
| **Validation bug rate** | Not escalated to **3+** | Path A |
| **Stale UI after mutation** | Mitigated via **`router.refresh`** / local refetch patterns | Acceptable |
| **Optimistic need** | Notifications **read state** uses light optimism — **scoped exception** | DU-038 |

### When Path A succeeded

- **D-Setup, D-1, D-2, D-4, D-7, D-8:** Straightforward component work with existing hooks.
- **Shared helpers** reduced duplication — especially **D-7** consolidation.

### When Path A strained

- **D-3** assignment modals — **directory fetch** + branching conditions.
- **D-5** routing — **`rule-condition-row.tsx`** still **437** lines — indicates **continued decomposition** opportunity **without** framework mandate.

### LOC budget breaches (programmatic memory)

- **D-3 / D-5:** Soft caps stressed; mitigations: **extract leaf rows**, **label modules**, **pagination helpers**.
- **D-8:** Hard cap **~400 LOC delta** — **met** by trimming duplication + shared format lib.

### RHF pilot decision rationale

**DU-007:** Pilot **not** activated — continuing Path A minimized **stack split** risk and matched delivery throughput expectations.

### F-phase recommendations

1. **Measure** modal LOC post-decomposition — if **still** expanding, **revisit DU-006** with **one** pilot surface.
2. **Webhook UI (E)** — reuse **`PlanGateBanner`** stack for **Enterprise** gating (**D-005**/**D-008** master-plan decisions).
3. **`07` doc** — reconcile numbering for onboarding (**DU-032**).

### Lessons learned (process) — MACRO-FASE D

Mirror spirit of [08 §11](./08-macro-fase-c-summary.md), scoped to **UI**:

#### What worked well

1. **D-Spike lock (`09`)** — Eliminated weekly debates about **RHF vs Path A** during execution.
2. **`Button` primitive upfront** — Prevented “five competing button styles” after parallel prompts.
3. **Directory pagination helper** — Avoided five bespoke cursor loops across modals.
4. **Label modules (`*-labels.ts`)** — Reduced drift between **modal** copy and **section** summaries.
5. **Plan gate consolidation (D-7)** — Converted scattered upgrade branches into **predictable** UX.
6. **Notifications formatter extraction** — Prevented bell/inbox divergence without increasing deps.
7. **Hard stops per phase** — Examples: **no bell polling change**, **no backend growth** in D-8 — kept reviews honest.
8. **Split D-1 into D-1a/b** — Improved review focus vs monolithic access-model PR.

#### What to refine next macro-phase

1. **Documentation currency** — **`07`** reconciliation remains unpaid debt (**DU-032**).
2. **Large leaf files** — `rule-condition-row.tsx` still challenges readability — future decomposition or **pilot** framework.
3. **Manual QA scaling** — Acceptable for **one macro-phase**, but **E/F** may require **targeted** automation for webhook URLs + retries.
4. **Visual regression** — None in D; consider lightweight screenshot harness **only** if UI churn spikes post-E.

#### Cross-phase coupling (UI-specific)

1. **D-7 after D-3/D-5/D-6** — Plan UX consolidated **after** stress proved duplication pain.
2. **D-8 after notifications APIs** — Inbox shipped **without** API expansion — respects Path A **consumer-only** discipline.
3. **Queue (D-4) after rules (D-3)** — Operators configure assignment **before** daily queue workflows — matches operational reality.

---

## Section 9 — Migration impact

### Zero migrations for UI-only MACRO-FASE D

- **No** new folders under `prisma/migrations/` were **required** to ship **D-Setup → D-8** product UI.
- **Schema authority** remains MACRO-FASE B/C history ([08 §8](./08-macro-fase-c-summary.md)).

### Backend touches (explicit exceptions)

| Tranche | Nature | Purpose |
| --- | --- | --- |
| **D-1a** | **Unified / consolidated API path** | Reduce duplicate client fetches — **narrow**, reviewed |
| **D-2** | **`null` clear** or equivalent **small correctness** fix | Localized bugfix — **not** a feature expansion |

### Deferred backend work (cross-phase)

- **`triggerOnAmountChange` engine hook** — needs **record amount edit** pathway — **F-phase** backend alignment (**TD-D5-001**).
- **Webhooks worker + UI** — **MACRO-FASE E** per revised roadmap (**DU-035**, [05-webhooks.md](./05-webhooks.md)).

---

## Section 10 — Handoff notes for MACRO-FASE E (Webhooks)

### E-phase scope anchor ([07 Section 4](./07-execution-plan.md) — historical table)

The **original** execution plan placed **webhooks** under **“Phase D”** cron/async — **superseded** by revised macro ordering in [**08 §10**](./08-macro-fase-c-summary.md) and [**09 §7**](./09-d-spike-ui-patterns.md). **MACRO-FASE E** targets **webhook delivery**, **signing**, **retries**, and **tenant configuration UI** per [**05-webhooks.md**](./05-webhooks.md).

### E-phase surface area (from [`05-webhooks.md`](./05-webhooks.md) — structural guide)

> **Note:** The following is a **reader’s map** of **05**; implementation sequencing remains **E-phase** planning.

1. **Endpoints model** — `WebhookEndpoint` + status lifecycle (`ACTIVE`, `PAUSED`, `DISABLED_AUTO`) — UI must show **state** and **last success/failure** timestamps.
2. **Security** — Secrets stored hashed; **raw secret shown once** — mirror patterns used in API-key UX elsewhere (never echo secrets on reload).
3. **Signing** — Receivers verify **HMAC SHA256** (**master-plan D-008**) — documentation strings should stay aligned with **05** Section examples.
4. **Delivery model** — Async worker expectations — UI surfaces **history**, not synchronous results.
5. **Retries & backoff** — Operator-facing **delivery logs** should expose terminal failure reasons without leaking internal stack traces.
6. **Plan & flags** — Enterprise tier (**D-005**) plus optional tenant feature flags (**D-010**) — reuse **`PlanGateBanner`** + server deny mapping (**DU-019**).
7. **Payload versioning** — Align UI labels with payload versions — breaking changes demand version bumps (`api-versioning-and-deprecation.mdc`).
8. **Governance** — Multi-endpoint configuration per tenant — pattern similar to **routing rules list** (sortable, explainable).

### Relitrue UI patterns **E** should copy from **D**

| Pattern | Where established | Reuse hint |
| --- | --- | --- |
| **Settings section layout** | Finance teams + rules sections | Webhooks tab grouping |
| **Modal create/edit** | Routing/assignment modals | Endpoint create/edit |
| **Plan denial UX** | `PlanGateBanner` | Enterprise-only messaging |
| **Inline directory fetch errors** | Assignment/routing modals | Validate URL reachability messaging via API errors only |
| **Manual QA discipline** | All D phases | Staging checklist before automation investment |

### Explicit non-goals for **E** UI (until specified elsewhere)

- **Real-time socket dashboard** for webhook throughput — optional observability belongs to **F** themes.
- **Customer-provided CA pinning UI** — unless security ADR expands scope.
- **Editing historical deliveries** — immutable log semantics expected.

### Coordination with notifications (`D-8`)

Webhook **delivery failures** may eventually generate **`/api/app/notifications`** entries — **coordinate event names** with backend owners before exposing copy in inbox filters (**TD-D8-004** future server filters).

### E-phase dependency on backend completeness

| Dependency | Owner phase | UI expectation |
| --- | --- | --- |
| **Delivery worker** | E backend | Settings UI lists endpoints **even when** worker paused — clear banner |
| **Rotate secret route** | C/E API | UI rotates + displays hint |
| **Enterprise enforcement** | Billing + API | Same detection helper family as **D-7** |

---

### Handoff subsection — Risk register for E-phase kickoff

| Risk | Mitigation |
| --- | --- |
| **URL SSRF** | Server-side URL validation — never trust browser-only checks |
| **Secret leakage in logs** | Follow `secrets-and-cryptography.mdc`; UI never logs raw secret |
| **Webhook storm** | Worker-side throttles — UI shows **paused** state clearly |
| **Plan ambiguity** | Single billing source-of-truth prop drilling from RSC layouts |

---

### Backend gaps that may surface during E

| Gap | Symptom | Mitigation |
| --- | --- | --- |
| **TD-D5-001** / amount edit | Rules toggled **on** without firing | Implement record edit hook before marketing “smart triggers” |
| **Webhook schema exists (B10)** | UI needs **plan gate** + **feature flag** awareness | Reuse **DU-019** patterns |
| **D-010** | Worker must **fail closed** when disabled | Align worker + API guards |

### UI patterns established that E should reuse

- **`useApiFetch`** + **inline** error handling for forms.
- **`PlanGateBanner`** for **Enterprise-only** surfaces.
- **Settings section** layout parity with **financial config** (tabs/sections).
- **Manual QA** discipline until RTL policy changes.

### Plan-gate primitive for webhook features

- Import **`PlanGateBanner`** + **`isUpgradeRequiredFromApiResponse`** when **`403`** responses encode upgrade-needed semantics — maintain **TD-D7-001** discipline (**quota** vs **feature**).

### Notifications integration possibilities

- Webhook **delivery events** may eventually feed **`/api/app/notifications`** — **no** D-8 code dependency required; **inbox** can gain filters when backend exposes categories (**TD-D8-004**).

### Cross-reference: master-plan decisions

- **D-005** Enterprise tier for webhooks.
- **D-008** HMAC SHA256 signing.
- **D-010** feature-flag high-risk paths.

---

## Section 11 — Document gaps

1. **`07-execution-plan.md` macro reconciliation** — Section 4–6 still describe **legacy** phase letters for async/UI — **DU-032**.
2. **Per-commit hash map** for D-1a…D-8 — not embedded here; use **`git log --grep`** / PR titles if audit needs exact SHAs.
3. **Exact LOC sum for entire MACRO-FASE D** — not machine-tagged; **§2 + §4** provide **partial sums** and **budget narratives**.
4. **Playwright/RTL** adoption decision — remains **explicitly open** for **F-phase** ([09 §3.8](./09-d-spike-ui-patterns.md)).
5. **Visual regression** tooling — not introduced.

---

## Section 12 — Changelog

| Version | Date | Summary |
| --- | --- | --- |
| **v1.0** | 2026-05-03 | Initial **MACRO-FASE D** summary + **E** handoff — mirrors [**08**](./08-macro-fase-c-summary.md) structure; consolidates **09** decisions + phase notes |
| **v1.x** (future) | TBD | Append rows — **do not rewrite** history; add migration counts if schema phase resumes |

---

### Appendix A — Math verification worksheet

**Test progression**

- \(449 + 9 = 458\) unit — matches **npm test** output during D-9 verification (**458 passed**).
- Integration **34** stable per **08** + D-Spike — **no UI-phase integration churn expected**.

**Primitive subset sum**

- \(92+53+79+119+34+59+71+10+27+437+275 = 1256\) lines across listed canonical artifacts — **subset only**.

**Inconsistencies discovered**

- **`07-execution-plan.md`** Section 4–5 naming vs **09/08** revised macros — **documentation drift**, not code drift.
- **D-Spike “no optimistic updates”** vs **D-8 read receipts** — resolved as **scoped exception** (**DU-038**).

---

### Appendix B — Continuity cross-reference with MACRO-FASE C summary

| **08** section | Relationship to **10** (this doc) |
| --- | --- |
| **§1 Overview** | C backend totals (**449/34**) are **baseline before D UI**; D adds **+9 unit** once. |
| **§2 Phase recap** | C phases **C1–C14** produced APIs **D consumes** — mirror structure here with **D-Setup–D-8**. |
| **§3 D-001–D-010** | Master-plan decisions remain valid — UI **must not** contradict soft-delete, isolation, snapshot audit. |
| **§4 Primitives** | C primitives are **services + CAS + hooks**; D primitives are **`lib/*` labels + `ui/button` + plan gate**. |
| **§5 Tests** | C emphasized integration growth; D **holds** integration count — UI manually QA’d. |
| **§6 Tech debt** | Shared **`triggerOnAmountChange`** gap surfaces in **both** summaries. |
| **§7 File inventory** | C lists backend routes; §7 here lists **frontend** surfaces consuming them. |
| **§8 Schema map** | D adds **no** migrations — reference **08 §8** as frozen unless new macro opens schema. |
| **§9 Deferred** | UI work explicitly deferred pre-D — now **delivered** except **`07` doc drift**. |
| **§10 Next phases** | **08** predicted revised D/E/F — **this doc** closes **D** and hands off **E webhooks**. |

---

### Appendix C — Epic document crosswalk (implementation docs 01–07)

| Epic doc | Sections skimmed for D-phase grounding | UI relevance |
| --- | --- | --- |
| [01-access-model.md](./01-access-model.md) | Axis definitions, forbidden combinations, invitation propagation | D-1a/b |
| [02-finance-teams.md](./02-finance-teams.md) | Team model + counters conceptual | D-2 |
| [03-assignment-engine.md](./03-assignment-engine.md) | Rules, evaluations, queue semantics | D-3, D-4 |
| [06-approval-routing.md](./06-approval-routing.md) | Routing modes, triggers, participant lifecycle | D-5, D-6 |
| [05-webhooks.md](./05-webhooks.md) | Signing, retries, Enterprise tier — **handoff** | E-phase |
| [07-execution-plan.md](./07-execution-plan.md) | Historical numbering conflict — **use with caution** | Meta |

---

### Appendix D — Source evidence map (where facts live)

| Fact category | Primary evidence location |
| --- | --- |
| Locked UI patterns | [`09-d-spike-ui-patterns.md`](./09-d-spike-ui-patterns.md) |
| Backend completion narrative | [`08-macro-fase-c-summary.md`](./08-macro-fase-c-summary.md) |
| Code TD tags (`TD-D*`) | `src/**/*.tsx`, `src/lib/plan-gate-detection.ts` grep |
| Primitive line counts | PowerShell `Measure-Object -Line` snapshot during D-9 |
| Test totals | `npm test` Vitest summary (**458** tests, **52** files) |

---

### Appendix E — MACRO-FASE E (Webhooks) preparation checklist (starter)

Derived from [`05-webhooks.md`](./05-webhooks.md) — **not** execution commitments.

1. **Security:** HMAC verification (`D-008`), secret rotation UX, masked hints.
2. **Plan:** Enterprise gating (`D-005`) — reuse **`PlanGateBanner`** patterns (**DU-019**).
3. **Ops:** Delivery retries + backoff — worker surfaces **not** part of D UI.
4. **Admin diagnostics:** Failure counters align with doc thresholds (`consecutiveFailures`).
5. **Events:** Subscribe payload taxonomy stable before **E10-style** notification expansions.
6. **Tenant isolation:** Endpoint URLs validated server-side — prevent SSRF classes (`application-security.mdc`).
7. **Idempotency:** Worker dispatch keys documented per [`05`](./05-webhooks.md).
8. **Rate limits:** Avoid synchronous webhook fan-out from Route Handlers (`background-jobs-and-async.mdc`).

---

### Appendix F — D-8 manual QA checklist (verbatim themes)

Use during staging verification cycles:

1. `/app/notifications` renders inbox shell with tenant membership gate.
2. Category filter narrows **loaded** rows (**TD-D8-004**).
3. Read/unread filter narrows **loaded** rows.
4. Click row marks read (optimistic) + PATCH + navigates `actionUrl`.
5. Mark all read clears unread count + POST read-all.
6. Empty state when zero notifications returned initially.
7. Empty filtered state when filters exclude all loaded rows.
8. Sidebar link visible to authenticated users; active route styling on `/app/notifications`.
9. Header bell works unchanged (polling cadence **unchanged**).
10. Formatter parity bell vs inbox (`notifications-format.ts`).
11. Pagination **Load more** appends cursor results.
12. Basic mobile viewport sanity (sidebar + list stacking).

---

### Appendix G — Forbidden dependency reinforcement list (from D-Spike)

| Dependency class | Status in MACRO-FASE D |
| --- | --- |
| `@radix-ui/*` | **Not installed** |
| shadcn CLI | **Not used** |
| `react-hook-form` | **Forbidden** — **TD-D6-001** notes defer |
| `@tanstack/react-query`, `swr` | **Forbidden** |
| `@testing-library/react` | **Forbidden** |
| Playwright / Cypress | **Forbidden** |
| `sonner`, `react-hot-toast` | **Forbidden** — use existing toast primitive |

---

### Appendix H — Phase LOC narrative reconciliation

Because git-phase tags may be absent, reconcile LOC using **budget stories** instead of a single blame stat:

| Phase | Budget story |
| --- | --- |
| **D-Setup** | Single primitive file extension — **small** |
| **D-1a/b** | Multi-component settings — **medium** |
| **D-2** | Teams modals — **medium** |
| **D-3** | Largest assignment surfaces — **large** |
| **D-4** | Queue + modals — **medium-large** |
| **D-5** | Routing modals + **437-line** extracted row — **large** |
| **D-6** | Focused admin modal — **medium** |
| **D-7** | Shared **`plan-gate.tsx`** — **medium spread** |
| **D-8** | **≤400 LOC delta** hard-stop narrative — **met** |

**Interpretation:** Summing budgets across phases **intentionally exceeds** any single phase cap — MACRO-FASE D is **many prompts**, each individually reviewable.

---

### Appendix I — Glossary deltas vs MACRO-FASE C glossary ([08 §11](./08-macro-fase-c-summary.md))

| Term | MACRO-FASE D nuance |
| --- | --- |
| **Path A** | UI extension pattern — controlled forms + `useApiFetch` |
| **Plan gate banner** | UX construct — **not** authorization |
| **Directory fetch** | Client-side aggregated pagination helper — **not** a cache layer |
| **Loaded-set filter** | TD-D8-004 — filters apply to **cursor-loaded** notifications only |

---

### Appendix J — Future revision queue (for v1.1+)

1. Insert exact **git SHAs** once release tagging completes.
2. Replace approximate LOC table with **automated cloc** across `git diff` range when macro branch finalized.
3. Update **`07-execution-plan.md`** — archive legacy numbering in appendix footnote.
4. Add **screenshot anchors** if design system documentation matures.
5. Wire **internal wiki** link when enterprise onboarding portal exists.

---

### Appendix K — `.cursor/rules` crosswalk (MACRO-FASE D relevance)

High-signal mapping — full rule text remains authoritative under **`.cursor/rules/**`.

| Rule file | MACRO-FASE D touchpoint |
| --- | --- |
| **`00-core-constitution.mdc`** | App Router, no Server Actions, Route Handlers — **100% aligned** |
| **`security-multitenancy.mdc`** | UI never authoritative for tenant — APIs scoped |
| **`definition-of-done.mdc`** | Loading/empty/error states on major surfaces |
| **`authentication-and-session-security.mdc`** | Session via NextAuth — unchanged patterns |
| **`authorization-rbac-and-request-access.mdc`** | Permission UI uses provider + server props |
| **`api-contract-validation-errors.mdc`** | Forms rely on API error envelope |
| **`plans-usage-billing.mdc`** | Plan gates UX-only; billing truth server-side |
| **`ui-ux-contract.mdc`** | Component boundaries + states |
| **`architecture.mdc`** | Domain components under `components/app/**` |
| **`error-handling-and-resilience.mdc`** | Route handlers unchanged by D UI |
| **`testing-and-quality.mdc`** | Manual QA emphasis consistent with D-Spike |
| **`background-jobs-and-async.mdc`** | Reinforces webhook/async separation (**E**) |
| **`secrets-and-cryptography.mdc`** | Webhook secret UX must comply (**E**) |

---

### Appendix L — Frequently asked questions (macro-phase FAQ)

**Q: Why didn’t MACRO-FASE D add integration tests for UI?**  
A: Locked in **09 §3.8** — integration suite focuses on **tenant isolation engines**; UI regressions handled via **manual QA** during throughput macro-phase.

**Q: Why split D-1 into D-1a/D-1b?**  
A: Reviewability + milestone test uplift (**449→458**) without merging unrelated UI concerns.

**Q: Is `triggerOnAmountChange` “broken”?**  
A: **Persisted honestly** — engine subscription incomplete until amount-edit endpoint emits triggers (**TD-D5-001**).

**Q: Does inbox filtering query the database filter predicate?**  
A: **No** in D-8 — filters apply to **loaded** rows (**TD-D8-004**).

**Q: Can we install Radix now?**  
A: **Still forbidden** unless program explicitly revokes **09** — would be **new macro decision**.

**Q: Where is webhook UI?**  
A: **MACRO-FASE E** — see **§10** + [**05-webhooks.md**](./05-webhooks.md).

---

### Appendix M — Phase → permission matrix (rough)

| Phase | Typical permission / gate |
| --- | --- |
| **D-1** | `tenant.users.manage`, invite flows |
| **D-2** | `tenant.financial_config.manage` |
| **D-3** | same + **assignment engine** plan/feature |
| **D-4** | finance queue server authorization |
| **D-5** | `tenant.approval_routing.manage` + routing plan/feature |
| **D-6** | routing admin action |
| **D-7** | (UX layer only — inherits underlying routes) |
| **D-8** | authenticated user surfaces |

---

### Appendix N — Observability expectations (UI slice)

MACRO-FASE D **does not** add new metrics pipelines. Future **F-phase** observability should still:

1. Log **client-visible failures** only via existing API logging — **no** PII in browser analytics (none added).
2. Maintain **correlation** between **plan denial** server logs and **upgrade** clicks — requires product analytics decision **outside** this doc.

---

### Appendix O — Terminology harmonization

| Colloquial | Precise |
| --- | --- |
| **“Macro D”** | **MACRO-FASE D — UI integrations** (this doc) |
| **“Phase D” in old `07`** | Often meant **async OOO/webhooks** — **obsolete** mapping |
| **“D-001” in conversation** | Could mean **master-plan D-001** — clarify context |
| **“DU-001”** | **Macro UI decision** unique to this summary |

---

### Appendix P — Integration test inventory pointer (unchanged during D UI)

MACRO-FASE D **did not** expand **integration** coverage — these paths remain the **C-era isolation backbone** (see [08 §7](./08-macro-fase-c-summary.md) “Integration — tenant isolation”):

1. `src/test/integration/tenant-isolation/finance-assignment-engine.integration.test.ts`
2. `src/test/integration/tenant-isolation/approval-routing-engine.integration.test.ts`
3. `src/test/integration/tenant-isolation/approval-routing-unblock.integration.test.ts`
4. `src/test/integration/tenant-isolation/approval-routing-reevaluation.integration.test.ts`

**Interpretation for auditors:** When validating UI flows, **these tests** cover **engine correctness**, not **React trees**. UI regressions remain **manual** unless/until **RTL** policy changes (**DU-028**, **DU-066**).

---

### Appendix Q — Unit suite stability narrative

The jump **449 → 458** occurs around **D-1a** API consolidation tests — afterwards **suite stays flat** intentionally:

- **No** broad UI RTL additions.
- **No** snapshot/component harness churn.
- **Bugfixes** in UI rarely require **new unit tests** unless touching **shared libs** (`*-labels.ts`, `plan-gate-detection.ts`) — prefer **API-level** regression tests when behavior is security-critical.

**458** therefore signals **backend contract stability** + **narrow D-1a additions**, not “UI coverage completeness.”

---

### Appendix R — “Nine phases” naming cheat sheet

| Colloquial count | Includes |
| --- | --- |
| **9 UI slices** | Often counts **D-1 through D-8** plus **one** of: **Setup** *or* merges **D-1a+D-1b** — clarify verbally |
| **10 execution prompts + doc** | **D-Setup + D-1a + D-1b + D-2 … D-8 + D-9** |

When executives say **“nine phases,”** confirm whether **Setup** or **D-9** is excluded — **this doc** treats **D-9** as **documentation-only**.

---

### Appendix S — Sample verification commands (developer ergonomics)

```bash
npx tsc --noEmit
npm test
npm run test:integration
npm run build
```

**Expected anchors:** **458** unit tests; **34** integration tests; **tsc** clean; **build** succeeds — captured during D-9 drafting (**npm test** snapshot).

---

### Appendix T — MACRO-FASE C vs MACRO-FASE D comparison (metrics)

| Dimension | MACRO-FASE C ([08](./08-macro-fase-c-summary.md)) | MACRO-FASE D (this doc) |
| --- | --- | --- |
| **Primary artifact** | Route handlers + services + engines | React UI + `lib/*` helpers |
| **Prisma migrations** | Multiple (**C7a–C14** window) | **0** for UI scope |
| **Unit test delta** | Large (+305 vs A6) | **+9** (narrow window) |
| **Integration test delta** | +24 vs A6 cumulative | **0** |
| **New forbidden deps** | N/A (backend) | **0** (Radix/RHF/etc.) |
| **Manual QA emphasis** | Lower (API-focused) | **Higher** (visual surfaces) |
| **Tech debt theme** | Engines, hooks, isolation | **Large forms**, **plan UX**, **filters** |
| **Macro close-out doc** | `08-macro-fase-c-summary.md` | `10-macro-fase-d-summary.md` |

---

### Appendix U — Master-plan decisions **D-001–D-010** quick echo (authoritative in `00-master-plan.md`)

> Full rationale lives in [08 §3](./08-macro-fase-c-summary.md); duplicated here as **handoff convenience only**.

| ID | Short label |
| --- | --- |
| **D-001** | 4-axis RBAC |
| **D-002** | Separate assignment vs routing models |
| **D-003** | Full assignment evaluation snapshots |
| **D-004** | Delegation HYBRID policy (schema; cron deferred earlier) |
| **D-005** | Enterprise webhooks tier |
| **D-006** | Denormalized finance counters |
| **D-007** | Soft delete for rules |
| **D-008** | Webhook HMAC SHA256 |
| **D-009** | Integration tests on isolation paths |
| **D-010** | Feature flags for high-risk features |

**UI implication:** These decisions **constrain** labels, plan messaging, and **never** become client-side enforcement substitutes.

---

### Appendix V — Notification surfaces inventory (post–D-8)

| Surface | Path / component | Behavior summary |
| --- | --- | --- |
| **Bell dropdown** | `notifications-bell.tsx` | Polling + compact list |
| **Full inbox** | `/app/notifications` | Filters + pagination + mark read |
| **Sidebar link** | `app-sidebar.tsx` | Placement **Queue → Notifications → New request** |
| **Shared formatting** | `notifications-format.ts` | Relative time + body token cleanup |

---

### Appendix W — Finance configuration “four-section” mental model (settings UX)

Even when tabs vary by deployment, **conceptual** grouping for operators:

1. **Teams** — who exists as finance grouping unit (**D-2**).
2. **Assignment rules** — how work lands (**D-3**).
3. **Queue** — operational throughput (**D-4**).
4. **Approval routing** — who must approve separately from assignment (**D-5–D-6**).

**Plus** cross-cutting **billing/plan** overlays (**D-7**).

---

### Appendix X — Closing statement (executive)

MACRO-FASE D completes the **first enterprise-capable operator loop** for finance processing and approval routing **configuration** and **operation** in Relitrue’s multi-tenant model — **without** opening new schema migrations for UI, **without** introducing forbidden front-end dependencies, and **without** diluting **MACRO-FASE C**’s isolation posture. The next macro-phase shifts outward integration risk to **webhooks** and asynchronous delivery — **E** — using the same disciplined separation between **server authority** and **client presentation**.

---

*End of MACRO-FASE D summary (`docs/epic/10-macro-fase-d-summary.md`).*
