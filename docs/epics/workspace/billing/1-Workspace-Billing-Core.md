# 1 — Workspace Billing Core (Plans, Metering, Rollover, Overage) — Provider-Agnostic (Paddle/Stripe Ready)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

# 🎯 Epic Objective

Implement a **production-grade, provider-agnostic billing enforcement layer** for workspace pricing (Free / Starter / Pro), fully integrated into:

/app/settings/workspace?tab=billing


This epic defines the **internal source of truth** for:

- Plan resolution
- Metering (requests, PDF exports, ZIP exports)
- Rollover (paid only)
- Overage computation + caps
- Hard cap (Free)
- Billing period lifecycle
- Usage ledger (append-only, idempotent)
- Subscription status gating
- Provider abstraction (Paddle-ready, Stripe-ready)
- Strict tenant isolation
- MFA-gated routes
- Performance-first implementation

⚠️ This epic DOES NOT implement Paddle or Stripe checkout.  
It makes the system fully ready to connect to any provider in J4.

---

# 🏗️ Architecture Placement (Exact Locations)

## Frontend (App Router)

Workspace Settings Page (already exists):

/app/settings/workspace/page.tsx


Billing Tab:

/app/settings/workspace/components/BillingTab.tsx


BillingTab fetches:

GET /api/billing/summary


No billing logic in UI.

---

## API Routes

/app/api/billing/summary/route.ts
/app/api/billing/usage-ledger/route.ts
/app/api/internal/billing/period-close/route.ts


All must:
- Validate session
- Call `requireFullSession(session)`
- Enforce tenant resolution server-side
- Use Zod
- Return standard error shape
- Enforce tenant isolation

---

## Server Layer

Create:

/server/billing/resolve-tenant-plan.ts
/server/billing/get-or-create-billing-state.ts
/server/billing/try-consume-meter.ts
/server/billing/compute-usage-summary.ts
/server/billing/period-close.ts
/server/billing/resolve-effective-subscription.ts
/server/billing/provider-types.ts


All enforcement must live here.

---

# 🧠 Provider Abstraction (Future-Proof)

This epic introduces a provider-neutral billing core.

## Subscription Provider Model (Already Present)

You already have:

Subscription.provider
Subscription.providerCustomerId
Subscription.providerSubscriptionId
BillingEvent.providerEventId


We formalize provider types:

```ts
type BillingProvider = "paddle" | "stripe" | "manual"

Rule

The billing core NEVER trusts provider webhook state directly.

Effective plan is determined by:

Subscription.status
Subscription.planId
Subscription.currentPeriodStart
Subscription.currentPeriodEnd
Subscription.graceUntil

Provider-specific logic will live in EPIC for implementing the actual checkout flow.

📦 Plans (Canonical Definition)

Plan codes:

- free
- starter
- pro

Plans are stored in Plan.featuresJson.

🟢 Free

Requests:
- Included: 10
- Hard cap: true
- Rollover: 0
- Overage: none
PDF:
- Included: 1
- Hard cap: true
- Watermark: true
ZIP: false
Search: false
Manual reminders: false
Payment status: false
AuditLog: basic

🟡 Starter — $59/month

Requests:
- Included: 200
- RolloverMonths: 2
- MaxAvailable: 400
- Overage: 25 cents
- OverageCap: 7900 cents
- Hard cap: false
PDF:
- Included: 50
- Hard cap: true
- Watermark: false

ZIP: false
Search: true
Manual reminders: true
Payment status: true
AuditLogDays: 90

🔴 Pro — $199/month

Requests:
- Included: 2000
- RolloverMonths: 1
- MaxAvailable: 4000
- Overage: 5 cents
- Hard cap: false
PDF: unlimited
ZIP: true
Search: true
Manual reminders: true
Payment status: true
AuditLog: full

🧱 Prisma Schema Additions

Add:

enum MeterKey {
  REQUESTS
  PDF_EXPORTS
  ZIP_EXPORTS
}

enum BillingPeriodStatus {
  OPEN
  CLOSED
}

model TenantBillingState {
  tenantId String @id
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  periodStart DateTime
  periodEnd   DateTime
  status BillingPeriodStatus @default(OPEN)

  rolloverRequests Int @default(0)

  planCode String @db.VarChar(50)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([periodStart])
  @@index([periodEnd])
}

model TenantUsageCounter {
  id String @id @default(cuid())
  tenantId String
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  periodStart DateTime
  meter MeterKey
  usedCount Int @default(0)
  version Int @default(0)

  @@unique([tenantId, periodStart, meter])
  @@index([tenantId, meter, periodStart])
}

model TenantUsageLedger {
  id String @id @default(cuid())
  tenantId String
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  periodStart DateTime
  meter MeterKey
  delta Int

  idempotencyKey String @unique
  sourceType String
  sourceId String?
  actorUserId String?

  createdAt DateTime @default(now())

  @@index([tenantId, periodStart, meter])
}

📏 Metering Rules
What Counts as Request
Count 1 when:

Record transitions to PENDING_APPROVAL
- Re-submit increments submitCount
- External approvals included
- Draft does NOT count

Add to Record:
submitCount Int @default(0)
Idempotency key:
REQ_SUBMIT:${recordId}:${submitCount}

🔁 Billing Period

Period = calendar month UTC.

Billing state ensures:
- periodStart
- periodEnd

Created automatically if missing.

🔄 Rollover Logic (Paid Only)

At period close:
- Get included
- Compute unused
- Apply rolloverMonths rule
- Cap to maxAvailable
- Store rolloverRequests in next period

Free: rollover disabled.

💸 Overage Logic

Starter:
- 25 cents per request
- Cap 7900 cents
- Never block

Pro:
- 5 cents per request
- No cap
- Never block

Free:
- Hard block
- Return UPGRADE_REQUIRED

🧠 tryConsumeMeter()

Must:
- Resolve effective subscription
- Resolve plan
- Ensure billing state exists
- Insert ledger idempotently
- Atomically increment counter
- Apply rollover deduction
- Compute overage
- Enforce hard cap for Free
- Return usage summary

All inside transaction.

🌐 Subscription Gating

Before allowing metered actions:
Resolve effective subscription:

If:
Subscription.status in (SUSPENDED, CANCELED)
AND graceUntil expired
Then:

Return UPGRADE_REQUIRED.

If PAST_DUE but within grace:
Allow operations.

This ensures Paddle/Stripe future compatibility.

🌐 API Endpoints
GET /api/billing/summary

Returns:
- lanCode
- subscriptionStatus
- periodStart
- periodEnd
- included
- rolloverAvailable
- used
- overageEstimate
- threshold flags

Auth + tenant.billing.manage required.

POST /api/internal/billing/period-close

- Idempotent
- Batch safe
- Runs daily
- Closes month if periodEnd passed
- Applies rollover

Protected by internal secret or vendor permission.

🖥️ BillingTab UI

Location:

components/app/settings/workspace-billing-tab.tsx

Must show:
- Plan
- Subscription status
- Usage bars
- Overage estimate
- Overage cap indicator
- 80% warning
- 100% warning
- Upgrade CTA

Single fetch.
AbortController in useEffect.

🔒 Security

- Tenant isolation mandatory
- MFA gating on all routes
- Idempotency required
- No client-side enforcement
- No raw SQL
- Ledger append-only
- Rate limit internal endpoints

⚡ Performance

- Indexed queries only
- No N+1
- Summary endpoint O(1)
- Short transactions
- Batch period close
- Request-scoped caching for resolveTenantPlan

🧾 Audit Events

Log:

- tenant.billing.period_closed
- tenant.billing.plan_changed
- tenant.billing.override

🧪 Definition of Done

- Schema migrated
- Plans seeded
- Helpers implemented
- Summary endpoint working
- Free hard cap enforced
- Starter rollover correct
- Starter overage cap enforced
- Pro rollover correct
- Subscription gating enforced
- Idempotency verified
- Tenant isolation verified
- Tests covering rollover, overage, gating

🚫 Non-Goals

- No checkout
- No provider webhook logic
- No annual plans
- No prepaid packs
- No invoicing engine
- No tax engine
- No enterprise custom pricing

📌 Final Principle

This epic builds a provider-agnostic billing engine.

Epic 2 in workspace/billing will connect Paddle.
Future epic can connect Stripe.

Billing core must NEVER depend on provider implementation.