# D-Spike Decision Document — MACRO-FASE D UI Patterns

This document locks UI architecture decisions for **MACRO-FASE D (UI Integrations, ~9 phases)**. It serves as **authoritative reference** for D-1 through D-9 phase prompts and should be consulted **before** introducing any new UI primitive, form pattern, or state management approach.

**Related:** [00-master-plan.md](./00-master-plan.md), [07-execution-plan.md](./07-execution-plan.md), [08-macro-fase-c-summary.md](./08-macro-fase-c-summary.md)

---

## Table of contents

1. [Document purpose and meta-decision](#section-1--document-purpose-and-meta-decision)
2. [D-Spike audit summary](#section-2--d-spike-audit-summary)
3. [Locked patterns for MACRO-FASE D](#section-3--locked-patterns-for-macro-fase-d)
4. [D-3 Review Point criteria](#section-4--d-3-review-point-criteria)
5. [D-Spike Setup tasks (PRE D-1)](#section-5--d-spike-setup-tasks-pre-d-1)
6. [MACRO-FASE D phase plan (high-level)](#section-6--macro-fase-d-phase-plan-high-level)
7. [What’s NOT in MACRO-FASE D (out of scope)](#section-7--whats-not-in-macro-fase-d-out-of-scope)
8. [Dependencies and constraints](#section-8--dependencies-and-constraints)
9. [Changelog](#section-9--changelog)

---

## Section 1 — Document purpose and meta-decision

## Meta-decision (LOCKED)

**Path A + Button primitive + D-3 review point.**

After comprehensive D-Spike audit of the existing UI stack, **MACRO-FASE D will EXTEND existing patterns** rather than modernize the stack.

### Rationale

1. **Production-grade existing codebase (NOT greenfield)** — Dozens of product components use controlled `useState` + `useApiFetch`; the pattern is proven in production.
2. **MACRO-FASE C demonstrated discipline > tooling** — 14 phases shipped with **0 production bugs** in the documented close-out using the current lightweight stack.
3. **Path B** (RHF + TanStack Query + RTL adoption) requires **migrating existing forms** or **accepting a permanent stack split** — both are worse than Path A for D throughput.
4. **MACRO-FASE F (Tech Debt)** provides an **escape hatch** if Path A pain materializes (see D-3 review and F-phase backlog).

### Strategic addition

Add a **`<Button>` primitive** (current `src/components/ui/button.tsx` only exports `ButtonLink`). Eight to nine D phases will add many action buttons; **standardizing variants now** prevents visual and behavioral inconsistency.

### D-3 review point

After **D-2** completes, evaluate whether **D-3** (finance assignment rule editor) is **>500 lines** under Path A. If **yes**, consider a **pilot RHF in D-3 only** with a written migration plan. If **no**, continue Path A through **D-9**.

---

## Section 2 — D-Spike audit summary

Brief recap of the **D-Spike audit** (eight audit sections + ten confirmation answers):

| Area | Finding |
| --- | --- |
| **UI library** | **Custom Tailwind kit** under `src/components/ui/` with **shadcn-like naming** — **not** a stock shadcn/Radix install (`package.json` has no `@radix-ui/*`, no shadcn CLI). |
| **Form pattern** | **Controlled `useState` / `useReducer`** + **`useApiFetch`**; **no** react-hook-form. |
| **Server-state** | **Native `fetch`** + **`useApiFetch`** (`src/hooks/use-api-fetch.ts`); **no** SWR / TanStack Query. |
| **Modal** | **Custom `Dialog`** (`src/components/ui/dialog.tsx`). |
| **Loading / empty / error** | **`Skeleton`**, **`Spinner`**, **`EmptyState`**, segment **`error.tsx`**, **`useToast`** for failures. |
| **Plan-gating UX** | **Partial** — concentrated in **billing** (`workspace-billing-tab.tsx`); **no** generic `PlanGate` / feature component yet. |
| **Permission UI** | **`TenantPermissionsProvider`** + **`useTenantPermissions()`**; server passes **`permissions[]`** for tabs and heavy screens. |
| **Testing** | **Vitest** in **Node**; **API + integration** tests are the norm; **no** React Testing Library, **no** `*.test.tsx`, **no** Playwright/Cypress in repo. |

**Full audit detail:** captured in the **D-Spike UI Patterns Audit** (Ask-mode recon); this doc is the **locking** artifact derived from it.

---

## Section 3 — Locked patterns for MACRO-FASE D

### 3.1 UI Primitives Layer

**LOCKED:** All new UI primitives live in **`src/components/ui/*`**.

**Existing primitives (20 files) — REUSE:**

- `alert.tsx`, `badge.tsx`, `card.tsx`, `container.tsx`, `dialog.tsx`
- `dropdown-multi-select.tsx`, `empty-state.tsx`, `hover-card.tsx`
- `icons.tsx`, `input.tsx`, `searchable-select.tsx`, `separator.tsx`
- `skeleton.tsx`, `spinner.tsx`, `table.tsx`, `tabs.tsx`, `textarea.tsx`
- `theme-logo.tsx`, `toast.tsx`
- `button.tsx` — currently **`ButtonLink` only**; extended per **Setup-1** (Section 5)

**New primitives planned:**

- **`ui/button.tsx`** — extend with **`<Button>`** (D-Spike Setup)
- **`ui/plan-gate.tsx`** — inline upgrade / feature gate (implementation **D-7**; contract locked in **§3.6**)

**FORBIDDEN:**

- **NO** Radix UI install
- **NO** shadcn CLI install
- **NO** Headless UI install
- **NO** new primitive roots outside `ui/` (domain components stay under `src/components/app/`, etc.)

---

### 3.2 Form Handling

**LOCKED:** **Controlled forms** with native React state.

**Pattern:**

- **`useState`** for form state (or **`useReducer`** when complexity warrants it)
- **`useApiFetch`** for submission
- Server returns **400** with Zod validation errors (standard API error shape)
- **`useApiFetch`** suppresses **400** toast so components show **inline** errors via local state
- **Manual `onChange` handlers** (no `register()`)

**Validation:**

- **Zod** schemas in **`src/lib/validations/*`** (server authority)
- **Client does NOT import Zod** at runtime for MACRO-FASE D
- Client relies on **API error responses** for validation feedback

**FORBIDDEN:**

- **NO** `react-hook-form`
- **NO** `formik`
- **NO** client-side Zod resolver
- **NO** Server Actions (per `00-core-constitution.mdc`)

**Sample reference files:**

- `src/components/app/settings/invite-member-modal.tsx` — simpler modal form
- `src/components/app/requests/create-request-form.tsx` — large controlled form

---

### 3.3 Server-State Management

**LOCKED:** **Native `fetch`** + **`useApiFetch`**.

**Fetch pattern:**

- All **`/api/*`** calls use **`useApiFetch`** from `src/hooks/use-api-fetch.ts`
- **401** → redirect to sign-out (built into wrapper)
- **400 / 429 / validation** → suppressed toast for **inline** handling
- Other errors → **`useToast`** via `getApiErrorMessage`

**Mutation pattern:**

- **Submit → await response →** on success: **`router.refresh()`** **or** **`setState` + re-fetch**
- **NO optimistic updates** in D phases (defer to F if needed)

**Refresh strategy:**

- **Server-rendered lists:** prefer **`useRouter().refresh()`** after mutation when the page is RSC-driven
- **Client-state lists:** re-fetch into local state
- **Do not** mix both strategies in the **same** component without an explicit comment and review

**FORBIDDEN:**

- **NO** SWR
- **NO** `@tanstack/react-query`
- **NO** parallel fetch wrappers to `useApiFetch`

**Sample reference files:**

- `src/hooks/use-api-fetch.ts`
- `src/components/app/settings/workspace-billing-tab.tsx`

---

### 3.4 Modals and Dialogs

**LOCKED:** **Custom `Dialog`** from `src/components/ui/dialog.tsx`.

**Pattern:**

- **Per-feature** modal components (not a generic `ConfirmDialog` in D)
- **Confirmation:** dedicated component (e.g. `PlanChangeConfirmModal`)
- **Forms:** form JSX composed inside **`Dialog`** body / `footer` props

**Naming convention:**

- **Confirmation:** `<Action>ConfirmModal` (e.g. `RevokeApprovalConfirmModal`)
- **Form:** `<Entity>FormModal` (e.g. `FinanceTeamFormModal`)

**FORBIDDEN:**

- **NO** `window.confirm()` in **new** D code
- **NO** Radix `AlertDialog`
- **Generic `ConfirmDialog` wrapper** — **deferred**; per-feature modals remain canonical until F-phase consolidation if ever

**Sample reference files:**

- `src/components/app/settings/plan-change-confirm-modal.tsx`
- `src/components/app/settings/transfer-ownership-modal.tsx`

---

### 3.5 Loading / Empty / Error States

**LOCKED:** Per **`definition-of-done.mdc`**, major data sections must have:

- Loading state  
- Empty state  
- Error state  
- Pending / disabled state for mutations  

**Conventions:**

- **Lists / tables loading:** `Skeleton` — `src/components/ui/skeleton.tsx`
- **Actions / buttons loading:** `Spinner` — `src/components/ui/spinner.tsx`
- **Empty data:** `EmptyState` — `src/components/ui/empty-state.tsx`
- **Route-level errors:** Next.js **`error.tsx`** in the same segment
- **Inline errors:** local state + `IconAlertCircle` (or equivalent)
- **Mutation pending:** `disabled` + `Spinner` in button

**Success / failure feedback:**

- **`useToast`** — `src/components/ui/toast.tsx`
- **Success:** toast on clear happy paths where appropriate
- **Unexpected failures:** toast; **validation** stays inline (wrapper behavior)

**FORBIDDEN:**

- **NO** `sonner`
- **NO** `react-hot-toast`
- **NO** ad-hoc spinners — reuse **`Spinner`**

---

### 3.6 Plan-Gating UX (NEW PATTERN — established in D-7)

**LOCKED:** **Server-resolved entitlements** + new **`ui/plan-gate.tsx`** (implementation **D-7**).

**Pattern (target implementation in D-7):**

- **RSC** (or server loaders) resolve plan / feature flags via existing server helpers (e.g. subscription + feature resolution — **exact helper names** chosen in D-7 prompt; **never** trust client-only flags for enforcement)
- Pass **`feature` enablement** into client components as **props** derived on the server
- **`ui/plan-gate.tsx`** (contract):
  - Props: `{ feature: string; isEnabled: boolean; children: React.ReactNode; fallback?: React.ReactNode }`
  - When **`isEnabled`:** render **`children`**
  - When disabled: render **`fallback`** or default **upgrade prompt** (copy aligned with billing tab where possible)

**Plan-gated D phases (tentative mapping):**

- **D-3:** Finance assignment rule editor — e.g. `features.assignmentEngine` (exact key from server contract)
- **D-5:** Approval routing rule editor — e.g. `features.approvalRouting`
- **D-6:** Manual re-eval control — e.g. `features.approvalRouting.enabled` or equivalent server flag

**Before D-7:** D-3 / D-5 / D-6 may use a **temporary inline** pattern (server prop + conditional render) **without** duplicating entitlement **resolution** logic — centralize resolution in one server module per screen group.

**FORBIDDEN:**

- **NO** scattering raw plan checks across many components without a shared server resolver
- **NO** trusting client for entitlements — UI is UX only; **APIs remain authoritative**

---

### 3.7 Permission-Aware UI

**LOCKED:** **Server** resolves permissions for navigation; **hook** for client checks.

**Existing infrastructure (REUSE):**

- `TenantPermissionsProvider` — `src/components/app/tenant-permissions-context.tsx`
- **`useTenantPermissions()`** → `{ permissions, loading, has, hasAny }`
- Server-rendered tabs filtered with **`permSet.has(t.permission)`** — see `src/components/app/settings/workspace-settings-tabs.tsx`

**4-axis access UI (D-1 scope):**

- Server passes **full membership DTO** to client where needed: `workspaceRole`, `financialAccess`, `financeResponsibility`, `billingAccess`
- Heavy forms (member edit) receive **4-axis fields as props** from server-fetched data
- **`useTenantPermissions`** for **action** gating (`tenant.users.manage`, etc.)

**Convention:**

- **Hide** actions when permission missing (**preferred**)
- **Disable + tooltip** only when product copy requires explaining *why* (rare)

**FORBIDDEN:**

- **NO** second permission system
- **NO** client-only authorization — server/API always enforce
- **NO** magic permission strings scattered without shared constants (reuse or add `src/lib/tenant-role-permissions.ts` / similar)

---

### 3.8 Testing Approach

**LOCKED:** **API / integration tests** as source of truth (extend **MACRO-FASE C** pattern).

**For MACRO-FASE D:**

- Form **submission** behavior validated via **route handler** tests where security-critical
- Permission / plan gating validated **server-side** (many paths already covered in C-phase APIs)
- Tenant isolation via **integration** tests for new critical paths when touching isolation surfaces
- **Manual QA** per phase for UI

**FORBIDDEN in MACRO-FASE D:**

- **NO** `@testing-library/react`
- **NO** `@testing-library/jest-dom`
- **NO** Playwright
- **NO** Cypress

**Deferred (F-phase):**

- RTL / Playwright may be evaluated if D exposes real gaps
- **Not** blocking MACRO-FASE D delivery per this decision doc

---

## Section 4 — D-3 Review Point criteria

## D-3 Review Point (mandatory after D-2 completes)

After **D-2** (Finance team management UI) ships and **before** **D-3** (Finance assignment rule editor) starts, evaluate **Path A continuation** vs **Path B pilot**.

### Triggers for Path B pilot consideration

**Signal 1 — Form complexity**

- D-1 or D-2 **single form file >500 lines**
- Form state boilerplate **>40 lines** of `useState` / `useReducer` in one component
- **More than 3** nested form sections driving independent validation concerns

**Signal 2 — Validation bug rate**

- **More than 3** form validation bugs in D-1 or D-2 testing
- Inconsistent error display across forms (inline vs toast vs silent)

**Signal 3 — Server-state freshness bugs**

- **More than 2** instances of **stale UI** after mutation
- `router.refresh()` (or chosen refresh strategy) **not** propagating expected RSC data

**Signal 4 — Optimistic update need**

- Critical UX blocked by lack of optimistic feedback
- User-perceptible latency **>500ms** in D-1 or D-2 **and** product requires immediate feedback

### Decision matrix

| Signals triggered | Action |
| --- | --- |
| **0** | Continue **Path A** through D-9 |
| **1** | Continue Path A; add **F-phase** backlog item |
| **2** | **Pilot RHF in D-3 only**; re-evaluate after D-3 |
| **3+** | **Path B from D-3**; plan broader migration in F-phase |

### Process

1. After D-2 merge, **before** D-3 prompt:
   - Review metrics (line counts, bugs, freshness)
   - Record decision in session notes
   - **Update this doc** if Path B pilot or switch is triggered

---

## Section 5 — D-Spike Setup tasks (PRE D-1)

## D-Spike Setup (pre-D-1)

These tasks should complete **before** phase **D-1** starts.

### Setup-1: Add `<Button>` primitive to `ui/button.tsx`

**Scope:**

- Extend `src/components/ui/button.tsx`
- Add **`<Button>`** alongside existing **`ButtonLink`** (no breaking changes to `ButtonLink`)
- **Variants:** `primary` | `secondary` | `destructive` | `ghost`
- **Sizes:** `sm` | `md` | `lg`
- **States:** default | **loading** (embedded `Spinner`) | **disabled**

**Sample API:**

```tsx
<Button variant="primary" size="md" loading={isPending} disabled={!isValid}>
  Save changes
</Button>
```

**Estimated:** ~1 focused prompt

---

### Setup-2: Plan-gate contract (implementation deferred to D-7)

**Scope:**

- Contract documented in **Section 3.6**
- **`ui/plan-gate.tsx`** implemented in **D-7**
- **D-3 / D-5 / D-6:** use **temporary inline** gating with **server-resolved** props until D-7 lands the shared component

**Estimated:** N/A beyond this doc + D-7 phase

---

### Setup-3: `07-execution-plan.md` numbering update (deferred)

**Scope:**

- Align `docs/epic/07-execution-plan.md` with **revised macro numbering** (UI = D, Webhooks = E, Tech debt + OOO/delegations = F)
- Cross-reference: `08-macro-fase-c-summary.md` Section 10 note

**Status:** Deferred to **D pre-planning**; **this doc** is authoritative for UI work until execution plan is updated

---

## Section 6 — MACRO-FASE D phase plan (high-level)

## MACRO-FASE D Phases (preliminary)

| Phase | Scope | Plan-gated | Permissions / notes |
| --- | --- | --- | --- |
| **D-Setup** | Add `<Button>` primitive | No | N/A |
| **D-1** | 4-axis access UI (member edit + invite forms) | No | e.g. `tenant.users.manage` / invite per existing API |
| **D-2** | Finance team management UI | No | `tenant.financial_config.manage` |
| **D-3** | Finance assignment rule editor | **Yes** (assignment engine) | `tenant.financial_config.manage` |
| **D-4** | Finance queue UI (start / complete / release / reassign) | No | Finance queue auth (server) |
| **D-5** | Approval routing rule editor (sequential vs parallel) | **Yes** (approval routing) | `tenant.approval_routing.manage` |
| **D-6** | Manual re-eval admin button + confirmation | **Yes** (routing enabled) | `tenant.approval_routing.manage` |
| **D-7** | Plan-gating UX (`ui/plan-gate.tsx` + inline upgrade prompts) | N/A (introduces pattern) | N/A |
| **D-8** | Notification surfaces (in-app feed) | No | Read-focused where applicable |
| **D-9** | UI summary doc + handoff to **E** (Webhooks) | N/A | N/A |

**Total:** **9** UI phases + **Setup**. Roughly **3–5 weeks** of conceptual + implementation work (prompt cadence as in C).

---

## Section 7 — What’s NOT in MACRO-FASE D (out of scope)

## Out of scope for MACRO-FASE D

- **Webhook delivery system** — **MACRO-FASE E**
- **Out-of-Office / Delegations** — **MACRO-FASE F** (per revised numbering)
- **RTL / Playwright** test infrastructure — defer to **F** if needed
- **RHF / TanStack Query** — defer unless **D-3 review** triggers pilot
- **Broad refactors** of unrelated pre-EPIC components — only **D-touching** changes
- **Email template** redesign
- **Mobile-first** redesign / dedicated mobile patterns
- **Full accessibility audit** beyond baseline practices and existing components
- **Internationalization** beyond existing locale patterns
- **`CREATOR_MANAGER` approver targetType UI** — blocked on schema (`User.managerId` or equivalent)

---

## Section 8 — Dependencies and constraints

## Constraints honored

- **`00-core-constitution.mdc`** — App Router, no Server Actions, Route Handlers for mutations, etc.
- **`ui-ux-contract.mdc`** — component boundaries, screen states
- **`architecture.mdc`** — domain separation; UI not source of truth
- **`application-security.mdc`** — XSS, sanitization (e.g. markdown paths)
- **`definition-of-done.mdc`** — loading / empty / error / pending for major surfaces

## Approved dependencies (existing — do not churn without ADR)

- **next** — App Router (project pin)
- **react** / **react-dom**
- **tailwindcss** v4
- **zod** — **server-side** validation authority
- **next-auth** — JWT strategy

## Forbidden dependencies (do **not** install in MACRO-FASE D)

- `@radix-ui/*` (any)
- shadcn CLI / new generated UI installs
- `react-hook-form`, `formik`
- `@tanstack/react-query`, `swr`
- `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`
- `@playwright/test`, `cypress`
- `sonner`, `react-hot-toast`

---

## Section 9 — Changelog

## Changelog

| Version | Date | Summary |
| --- | --- | --- |
| **v0.1** | 2026-05-01 | Initial D-Spike decision doc. Locks **Path A + `<Button>` primitive + D-3 review point**. Derives from D-Spike audit (8 areas, 10 confirmations). Reference for D-Setup through D-9. |

---

*End of document.*
