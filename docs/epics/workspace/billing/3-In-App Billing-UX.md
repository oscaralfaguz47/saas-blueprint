➡️ **Epic 3 — In-App Billing UX (Enterprise Plan Management System)**



# EPIC 3 — In-App Billing UX (Enterprise Plan Management System) — Cursor-Ready (Shadcn, Next.js App Router)
> Implements production-grade, enterprise-quality in-app plan management UX for workspace billing.
> This epic consumes EPIC 2-Paddle-Integration.md APIs for checkout + portal.

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.
---

## 🎯 Epic Objective

Deliver a **best-in-class in-app billing experience** (Stripe/Vercel/Linear-style) that:

1) Treats Billing as **plan management**, not direct “buy now” buttons.
2) Allows users to **compare plans** and choose the best upgrade path (Free → Starter/Pro, Starter → Pro).
3) Supports **downgrade scheduling at period end** (no immediate downgrade).
4) Provides clear, state-based UI for subscription lifecycle: ACTIVE, PAST_DUE, CANCELED, TRIAL, SUSPENDED.
5) Minimizes checkout friction while preserving a **confirmation step** before redirecting to Paddle checkout.
6) Uses Shadcn UI components with consistent design tokens and enterprise microcopy.
7) Works as a Client Component (per your current architecture) while remaining secure and tenant-safe.

---

## ✅ Scope

### Included
- Billing Overview UI (in `/app/settings/workspace?tab=billing`)
- **Change Plan** modal (plan selector)
- **Confirm Plan Change** step (pre-checkout confirmation)
- Upgrade flow: Free → Starter/Pro, Starter → Pro
- Downgrade flow: Pro → Starter, Starter → Free (scheduled at period end)
- Paddle checkout handoff flow via Epic 2-Paddle-Integration.md `/api/billing/paddle/checkout`
- Return flow after checkout (`/checkout` redirects back to billing tab)
- Portal access CTA (`/api/billing/paddle/portal`)
- State-based banners (past_due, canceling, grace period)
- Loading, error, empty states, retry UX
- Accessibility (keyboard + screen reader support)
- UI event tracking hooks (non-PII, internal analytics/audit alignment)

### Not Included
- Public marketing pricing page changes
- Annual billing toggle (prepare for it; don’t implement pricing math)
- Seats-based billing / add-ons
- Proration engine (handled by Paddle)
- Invoice rendering
- Tax/VAT UI configuration

---

## 🧱 UX Architecture (Key Principle)

### Marketing Pricing ≠ In-App Billing UX
- Do **not** reuse the marketing `/pricing` page inside the app.
- In-app billing must be compact, operational, and decision-oriented.

### Flow Summary (Enterprise Standard)

1) Billing Tab → user sees current plan, usage, and status
2) User clicks **Change plan**
3) Plan Selector Modal opens (compare Free/Starter/Pro)
4) User selects target plan → **Confirm step**
5) Confirm step triggers checkout (upgrade) OR schedules downgrade (no checkout)
6) If upgrade: redirect to `/checkout?...` and Paddle overlay runs
7) After `checkout.completed` user returns to Billing Tab
8) Webhook sync updates subscription → UI reflects new plan

---

## 🧩 UI Information Architecture (Billing Tab)

### Primary Sections
1) **Plan Card** (Current plan + status + renewal)
2) **Usage Card** (requests used / limit + rollover note)
3) **Actions** (Change Plan, Manage Subscription)
4) **Status Banners** (past_due, canceling, grace, suspended)
5) **Billing Clarity** (compact rules; minimal copy)

### Design Rules
- Single primary CTA: **Change plan**
- Secondary CTA: **Manage subscription** (portal)
- Keep copy short; avoid marketing language
- Use status colors sparingly: neutral first, color only for meaning

---

## 🎛️ Components (Shadcn)

### Must Use
- `Card`, `CardHeader`, `CardContent`, `CardFooter`
- `Button`
- `Badge`
- `Alert` (for warnings)
- `Dialog` (for modals)
- `Separator`
- `Skeleton`
- `Tooltip`
- `Tabs` (already used on Settings page)
- `Toast` (sonner/toast pattern in your app)

### Optional
- `Progress` (usage bar)
- `ScrollArea` (modal plan list if needed)

---

## 🧬 Component Tree (Implementation)

### BillingTab (Client Component)
- `BillingOverview`
  - `PlanSummaryCard`
  - `UsageCard`
  - `BillingStatusBanners`
  - `BillingActions`
- `ChangePlanDialog` (Dialog)
  - `PlanSelector` (cards)
  - `PlanComparisonList` (compact)
- `ConfirmPlanDialog` (Dialog)
  - `ConfirmPlanSummary`
  - `ConfirmActions`

---

## 📍 Routes & Integration Points

### Existing Page
- `/app/settings/workspace?tab=billing`

### Existing Checkout Page (already implemented)
- `(public)/checkout` — loads Paddle.js, reads `_ptxn`, opens overlay, redirects on completion to billing tab.

### Epic 2-Paddle-Integration.md APIs used
- `POST /api/billing/paddle/checkout` (upgrade only)
- `POST /api/billing/paddle/portal`
- Subscription state is read via existing app data loader (DB truth, webhook-synced)

---

## 🧠 UX State Machine (Plan + Subscription)

Define a UI-level state machine based on Subscription fields:

### Plan State (derived)
- `currentPlan`: free | starter | pro
- `hasPaidPlan`: boolean (starter/pro)
- `isCancelingAtPeriodEnd`: boolean
- `isPastDue`: boolean
- `isInGrace`: boolean (now < graceUntil)
- `isCanceled`: boolean
- `isSuspended`: boolean

### UI must never infer plan changes from checkout success alone.
**Only DB truth (webhook-synced) updates the UI.**

---

## 🧾 Subscription State → UI Mapping (Enterprise UX)

| Internal Status | Badge | Banner | Primary CTA | Secondary CTA | Notes |
|---|---|---|---|---|---|
| ACTIVE | "Active" (neutral/green) | none | Change plan | Manage subscription | Show renewal date |
| TRIAL | "Trial" | info banner | Change plan | Manage subscription | Show trial end if available |
| PAST_DUE | "Past due" | warning banner | Update payment method | Manage subscription | Disable upgrade? (allow only portal) |
| SUSPENDED | "Suspended" | destructive banner | Resolve billing | Manage subscription | Keep access messaging minimal |
| CANCELED | "Canceled" | info banner | Reactivate (Change plan) | Manage subscription | Show access end date |

### CTA Details
- "Update payment method" opens portal (Paddle) — do not build payment method UI in-app.

---

## 🎯 CTA Matrix (By Plan)

### If current plan = Free
- Primary: **Upgrade plan** (label can still be “Change plan”, but modal copy should emphasize upgrade)
- Plan selector shows:
  - Free = Current
  - Starter = Upgrade
  - Pro = Upgrade

### If current plan = Starter
- Primary: **Change plan**
- Plan selector shows:
  - Free = Downgrade (scheduled)
  - Starter = Current
  - Pro = Upgrade

### If current plan = Pro
- Primary: **Change plan**
- Plan selector shows:
  - Free = Downgrade (scheduled)
  - Starter = Downgrade (scheduled)
  - Pro = Current

---

## 🪟 Modal 1: Change Plan (Plan Selector Dialog)

### Trigger
- Button: `Change plan`
- Placement: Billing card footer, left aligned
- Variant: default (primary)

### Dialog Specs
- `DialogTitle`: "Change plan"
- `DialogDescription`: "Compare plans and choose what fits your workspace. Upgrades apply immediately. Downgrades take effect at the end of your billing period."
- Width: `max-w-5xl` desktop; full width on mobile
- Content uses 3 plan cards in a grid (1 column mobile, 3 columns desktop)

### Plan Card Structure (in-app, not marketing)
Each plan card must include:
- Plan name
- Price (monthly)
- “Best for …” one-liner
- Key includes (max 5 bullets)
- Limits section (max 3 bullets)
- CTA button (stateful)
- Small legal/clarity note (optional, 1 line)

#### Highlighting Rule
- Starter card may show a small `Badge`: "Most popular"
- Do NOT overuse colors; only badge and subtle border emphasis.

### CTA labels inside modal
- Current plan: disabled button, label "Current plan"
- Upgrade: "Upgrade"
- Downgrade: "Downgrade" (opens downgrade confirm sheet)
- For PAST_DUE or SUSPENDED: disable upgrades; show CTA "Update payment method" (portal)

---

## 🪟 Modal 2: Confirm Plan Change (Confirmation Step)

### When it opens
After user clicks Upgrade/Downgrade in Plan Selector.

### Confirm Copy (must be explicit)
- Title: "Confirm plan change"
- Summary:
  - "You are upgrading to Starter — $59/month billed monthly."
  - or "You are downgrading to Free. Downgrades take effect at the end of the current billing period."

### Confirm Actions
#### For Upgrade
- Primary: `Continue to checkout`
- Secondary: `Cancel`
- On primary:
  1) call `POST /api/billing/paddle/checkout` with `{ planCode }`
  2) on success → `window.location.href = url` (or route push)
  3) show loading state while request pending
  4) prevent double click (disabled button)

#### For Downgrade (scheduled at period end)
- Primary: `Schedule downgrade`
- Secondary: `Cancel`
- On primary:
  - call internal endpoint (see "Downgrade scheduling API" below)
  - update UI to show `cancelAtPeriodEnd = true` + show "Downgrade scheduled" toast
  - no checkout

---

## 🧾 Downgrade Scheduling API (Required)

Because downgrades are scheduled (option B), Epic 3 requires a server endpoint.

### Endpoint (New)
- `POST /api/billing/change-plan`
Payload:
```json
{ "planCode": "free" | "starter" }

Rules:

- Must be authenticated
- Must have tenant.billing.manage
- Must resolve tenant server-side
- Must only allow downgrade targets (no "pro" here; upgrades use Paddle checkout)
- Must set cancelAtPeriodEnd = true and store pendingPlanCode (or equivalent)
- Epic 1 must enforce current plan until period end
- When period ends, Epics 1/2 must resolve the effective plan (implementation detail can be: cron/job or webhook update, but UI should treat it as scheduled)

Note: If you already have a provider-agnostic method in J3 for scheduling plan changes, reuse it.
This endpoint must not embed Paddle logic.

🧠 Billing Tab Banners (Enterprise UX)
Canceling at period end

Show when cancelAtPeriodEnd = true:

- Alert variant: default/info
- Copy:
  - Title: "Plan change scheduled"
  - Description: "Your plan will change on {currentPeriodEnd}. You’ll keep your current plan until then."
- Provide action: "Manage subscription" (portal) or "Undo" (optional)

Past due

Show when status = PAST_DUE:
- Alert variant: warning
- Copy:
   -Title: "Payment issue"
  - Description: "Your subscription is past due. Update your payment method to avoid service interruption."
- Primary CTA: "Update payment method" → portal

Grace period

If graceUntil is set and now < graceUntil:
- Alert variant: warning
- Description includes grace date.

Suspended

- Alert variant: destructive
- Copy: concise, no fear language.

🔁 Data Refresh Strategy (Client Component)
Rule

UI updates must reflect DB truth post-webhook sync.

Required UI behavior
- On Billing tab mount:
  - fetch current subscription state from existing loader or API
- After returning from checkout:
  - Billing tab should auto-refresh subscription state
- Use searchParams hint: if ?billing=updated present, trigger a refetch
- If no hint is available, still refetch once on mount

Loading UX

- Use Skeleton for plan card + usage card on initial load
- Use disabled buttons during mutations

Error UX

- Use toasts for user-safe errors
- Show inline error only inside modal when appropriate
- Never show raw provider errors

🧾 Checkout Handoff UX (Existing /checkout page)
Required behaviors

- When user arrives to /checkout?_ptxn=...:
  - Show minimal "Preparing secure checkout…" state (skeleton)
  - Initialize Paddle overlay automatically
- On checkout.completed:
  - Redirect to /app/settings/workspace?tab=billing&billing=updated
- On close/cancel:
  - Redirect back to billing tab with &billing=canceled
  - Billing tab shows a neutral toast: "Checkout canceled"

Epic 3 does NOT change Paddle overlay UI; only ensures the handoff is clean and user-safe.

✍️ Microcopy Rules (Enterprise Tone)

- Avoid aggressive sales language in-app.
- Prefer operational copy:
  - "Change plan"
  - "Manage subscription"
  - "Continue to checkout"
- Keep descriptions short; 1–2 lines max.
- Always state billing impact clearly in confirm step.

♿ Accessibility Requirements

- Dialogs must trap focus (Shadcn Dialog default)
- ESC closes modal safely (except during pending checkout request)
- Buttons have aria-label where icon-only
- Status badges readable (not color-only)
- Keyboard navigation supports plan selection

⚡ Performance Requirements

- Modal opens instantly (no heavy data fetch on open)
- Plan catalog should be static config in client (no network)
- Only network calls:
  - checkout URL creation (upgrade)
  - portal session creation
  - downgrade schedule endpoint
  - subscription refetch

  🔐 Security Requirements (UI)

- Never trust client for tenantId — all server endpoints resolve tenant from session
- Never expose providerSubscriptionId/providerCustomerId in client logs
- Never log Paddle checkout URL
- Prevent double-submit:
  - disable confirm button during request
  - use local isSubmitting lock

  🧪 Testing Requirements (UI)
Component tests

- Plan selector renders correct CTAs based on current plan
- Confirm step shows correct price/copy
- Upgrade triggers checkout endpoint with correct planCode
- Downgrade triggers schedule endpoint and shows banner
- Past due state disables upgrade and routes user to portal

E2E tests (Playwright recommended)

- Free → Pro upgrade flow reaches /checkout and returns to billing
- Starter → Free schedules downgrade; banner shows
- Past due shows warning + portal CTA
- Cancel checkout returns to billing + “canceled” toast

✅ Definition of Done

- Billing tab shows professional plan management UX (enterprise)
- No direct "Upgrade to X" buttons on Billing overview
- Plan selector modal implemented with Shadcn Dialog
- Confirmation step implemented for upgrade and downgrade
- Upgrade uses Paddle checkout handoff (existing /checkout)
- Downgrade schedules change at period end (option B)
- All subscription statuses map to correct banners/CTAs
- Loading + error states polished
- Accessibility passes basic keyboard + screen reader checks
- Tests added and passing

