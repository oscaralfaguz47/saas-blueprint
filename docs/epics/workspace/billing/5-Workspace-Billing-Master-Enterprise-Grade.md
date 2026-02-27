# EPIC 5 — Workspace Billing Master (Paddle) — Enterprise-Grade (Subscriptions, Plans, Payments UI, Billing Profile, Period Close, Rollover/Overage, Fair Use, Enterprise Self-Serve)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.  
> Core principle: **Paddle is payment source-of-truth; Our app DB is entitlement + usage source-of-truth.**  
> All billing actions MUST apply to the **current tenant context** (selected workspace), never “default tenant” except as explicit fallback.
This epic is a refactor of 4-Refactor-Epics-1-and-2-.md from docs/epics/workspace/billing, to ensure leave everything well implemented and ensure apply a robust and scalable billing system.

---

## 🎯 Objective

Deliver a **production-grade** workspace billing system for this app that supports:

- Plans: **Free / Starter / Pro / Enterprise (self-serve)**
- Single subscription per workspace (tenant)
- Paddle Transaction Checkout (modal) for:
  - New purchase
  - Update payment method
- Plan changes via **Update Subscription (change price)** (no cancel+recreate)
- Downgrade to Free = **cancel at period end** (no punishment)
- Payments history per workspace (filtering noise like ready/draft/0.00)
- “View invoice” (opens hosted PDF URL)
- “Edit billing details” for **future invoices** (address/company/VAT), stored in DB (Send an email to the Platform Admin emails for notification)
- “Request change billing details” for existing invoices (support ticket → platform admin, send an email to the Platform Admin emails)
- Usage metering:
  - Requests (counts on record submit transition to PENDING_APPROVAL)
  - PDF exports
  - ZIP exports
- Rollover (paid only) with policy:
  - Starter: **cap maxAvailable=400**, expiry **60 days**
  - Pro: **no overage billing**, soft cap + fair use monitoring
  - Enterprise: **hard cap** includedRequests=4000 (self-serve), no automatic overage
- Period close lifecycle (per subscription billing anchor)
- Scheduled overage charges (Starter) added to **next invoice** as one-time charge
- Webhook processing: signature-verified, idempotent, persist-first + replay-safe
- Strict tenant isolation and MFA gating for all tenant billing UIs/APIs
- Audit logging for all billing state transitions

---

## ✅ Non-Goals

- No Stripe implementation
- No annual plans (unless already present)
- No complex invoicing engine beyond “open hosted invoice PDF”
- No tax/VAT validation engine (Paddle handles tax calculation; this app only stores user input)
- No enterprise custom negotiated pricing (Enterprise is self-serve fixed price)

---

## 🧭 Key Decisions (Hard Requirements)

1) **Current Tenant Context**
   - All billing operations MUST run against the tenant/workspace selected in-app.
   - Backend must resolve tenantId from a canonical server-side function (see “Tenant Resolution”).

2) **No Paddle Portal as Primary UX**
   - Users manage billing inside this app's UI.
   - Paddle portal may be used only by platform admin or as emergency fallback.

3) **Single Subscription per Tenant**
   - Exactly one active Paddle subscription per tenant at any time.
   - Plan changes happen via **Update Subscription (change price_id)**.

4) **Downgrade to Free**
   - Implemented as **cancel at period end** (cancelAtPeriodEnd=true, pendingPlanCode="free").
   - Access remains until period end, then entitlements switch to Free.

5) **Starter Overages**
   - Starter has includedRequests=200.
   - If usage exceeds available (included + rollover), create a Paddle **one-time charge effective_from next_billing_period** to appear on the next renewal invoice.

6) **Pro Fair Use**
   - Pro is “unlimited” from user POV. Do NOT auto-bill overages.
   - Soft cap is 2000/month for monitoring only.

7) **Enterprise Self-Serve**
   - Enterprise includedRequests=4000/month, **hard cap**.
   - No auto-overage billing.

---

## 🏗️ Architecture & Locations

### Existing (keep)
- `/app/api/billing/paddle/webhook/route.ts` (signature verify + idempotency)
- `/app/api/billing/paddle/checkout/route.ts` (Transaction Checkout session)
- `/app/api/billing/paddle/payment-method/route.ts` (display only)
- `Subscription`, `Plan`, `BillingEvent`, `BillingTransaction`, `TenantBillingState`, `TenantUsageCounter`, `TenantUsageLedger` models

### Add / Update
#### Server (billing core)
- `/server/billing/tenant-context.ts` (NEW) — canonical current-tenant resolver
- `/server/billing/plans/catalog.ts` (NEW) — canonical plan rules (Free/Starter/Pro/Enterprise)
- `/server/billing/entitlements/resolve-effective-plan.ts` (UPDATE) — combines subscription + pending downgrade + grace rules
- `/server/billing/usage/try-consume-meter.ts` (UPDATE) — enforce caps + write ledger + counters
- `/server/billing/period/close.ts` (UPDATE) — close per-tenant periods using subscription anchor
- `/server/billing/overage/schedule-starter-overage.ts` (NEW) — create Paddle one-time charges for Starter
- `/server/billing/paddle/subscriptions/update-subscription-price.ts` (NEW) — change plan via Update Subscription
- `/server/billing/paddle/customer/update-billing-details.ts` (NEW) — update address/company/VAT for future invoices
- `/server/billing/paddle/invoices/get-invoice-url.ts` (NEW) — fetch invoice URL when missing
- `/server/billing/webhooks/persist-first.ts` (NEW) — ensure BillingEvent insert happens before processing
- `/server/billing/webhooks/replay.ts` (NEW) — internal endpoint to replay stored events (platform admin only)

#### API routes (tenant auth + MFA)
- `/app/api/billing/summary/route.ts` (UPDATE) — must use current tenant context
- `/app/api/billing/transactions/route.ts` (NEW) — list completed transactions (default)
- `/app/api/billing/billing-details/route.ts` (NEW) — GET/PUT billing profile (future invoices)
- `/app/api/billing/support-requests/route.ts` (NEW) — create “request change billing details”
- `/app/api/billing/change-plan/route.ts` (NEW) — plan changes: starter/pro/enterprise/free (free schedules cancel)
- `/app/api/internal/cron/billing/period-close/route.ts` (NEW, GET) — cron wrapper calling period close
- `/app/api/internal/cron/billing/starter-overage/route.ts` (NEW, GET) — cron wrapper scheduling overages
- `/app/api/internal/billing/replay-webhook-event/route.ts` (NEW, platform-only) — manual replay (optional)

#### UI
- `/app/settings/workspace?tab=billing` (existing) must show:
  - Current plan
  - Subscription status + next billing date
  - Usage bars + warnings
  - Payments list (completed by default)
  - Buttons:
    - View invoice
    - Edit billing details (future)
    - Request change billing details (support)
    - Change plan (upgrade/downgrade/free)

---

## 🔑 Tenant Resolution (Current Tenant Context)

### Requirement
Replace all billing operations that currently use `getDefaultTenantForUser()` with:

- `getTenantContextOrThrow(session, req)`:
  - Reads a signed server-side tenant context (e.g., cookie, session claim, or URL param validated against membership).
  - Must verify membership is ACTIVE and not disabled.
  - Must enforce tenant isolation.

### Implementation
- Create `/server/billing/tenant-context.ts`:
  - `getCurrentTenantId(session, req): Promise<string>`
  - `requireTenantPermission({ userId, tenantId, permission })`
- Keep `getDefaultTenantForUser()` only as fallback when no tenant is selected (explicitly logged as warning).

---

## 📦 Plan Catalog (Canonical)

Plan codes: `free`, `starter`, `pro`, `enterprise`.

### Free
- requests included: 10, hard cap true
- PDF exports: 1, hard cap true, watermark true
- ZIP exports: disabled
- rollover: none
- subscription: none

### Starter
- requests included: 200
- rollover:
  - paid only
  - cap maxAvailable=400
  - expiry=60 days
- overage: $0.25 per request (price_id OVERAGE_STARTER_REQUEST)
- overage cap: (keep existing cap if desired; else remove cap and rely on alerts)
- no hard cap

### Pro
- user-facing “unlimited”
- monitoring soft cap: 2000/month
- no auto-billing overage
- fair-use flags and escalation workflow to Enterprise
- no hard cap

### Enterprise (self-serve)
- requests included: 4000/month
- hard cap true (block requests beyond included)
- no auto-billing overage
- payment is self-serve like other plans

---

## 🧾 Billing Profile (Future Invoices) — Paddle-synced (Country/Postal locked)

### Checkout behavior (current)
- Paddle Transaction Checkout forces **Country** (required) and sometimes **Postal Code** (required by Paddle for tax).
- VAT UI is shown by Paddle in the payment step ("Add VAT number").
- Therefore, Country/Postal are treated as **tax-critical fields** and must be **locked** in this app UI.
- On first purchase, billing profile MUST be persisted automatically from Paddle checkout via webhooks, without user re-entry.
- Billing profile snapshot is updated by webhook events: transaction.completed (trigger) + address/business/customer events (data). If data missing, perform Paddle fetch.

### Goal
Maintain a **Tenant Billing Profile snapshot** in our DB for:
- Displaying current billing details in Billing UI
- Allowing user edits for **future invoices** (limited fields only)
- Support workflows for past invoices (manual portal change)
- Auditing and troubleshooting

### Editable fields (in-app)
User can edit ONLY:
- Company name (optional)
- VAT / Tax ID (optional)
- Address line 1 (optional)
- Address line 2 (optional)
- City (optional)
- Region/State (optional)

User CANNOT edit in-app:
- Country (locked; set by Paddle checkout)
- Postal code (locked; set by Paddle checkout)

### Address selection rule (required)

Paddle customers may contain multiple addresses.

When syncing billing profile:

- Prefer the address marked as billing/primary if available.
- Otherwise select the most recently updated address.
- Persist the selected `providerAddressId` deterministically.

This prevents address switching between webhook events.

### Billing profile sync idempotency (required)

Webhook-driven billing profile synchronization must be idempotent.

Use idempotency keys:

Webhook sync:
BILLING_PROFILE_SYNC:${providerEventId}

Backfill fetch:
BILLING_PROFILE_FETCH:${tenantId}:${providerCustomerId}:${YYYY-MM-DD}

Repeated webhook deliveries must not overwrite data unnecessarily.

### Data capture & sync strategy (required)
Billing profile must be populated via:
1) **Webhook ingestion (best effort)**:
   - On `transaction.completed` and/or subscription events, if payload contains billing address / VAT / company fields, store snapshot in DB.
2) **Backfill fetch from Paddle (source of truth)**:
   - If webhook payload does NOT include billing details, perform a server-side fetch from Paddle using `providerCustomerId`:
     - fetch current customer/business + primary address
     - update DB snapshot
   - Backfill triggers:
     - after first successful purchase (post-webhook processing), OR
     - on Billing tab load if snapshot missing/stale
### Billing Profile auto-capture from Checkout (zero re-entry)

Requirement:
- Billing profile data entered during Paddle Transaction Checkout (country/postal, address, company, VAT) MUST be persisted automatically in our DB, so the user never has to re-enter it in-app.

Notification Destination configuration (required):
Enable these Paddle events:
- customer.created, customer.updated
- address.created, address.updated
- business.created, business.updated
(Do NOT enable all events; only these + subscription/transaction events already used.)

Processing rule:
- Webhooks are persist-first + idempotent.
- Billing profile sync is event-driven:
  - On transaction.completed: trigger `syncBillingProfileFromPaddle(providerCustomerId)` after subscription/transaction upserts.
  - On customer/address/business created/updated events: update TenantBillingProfile snapshot immediately (webhook payload best-effort).
- If webhook payload lacks required fields (common), `syncBillingProfileFromPaddle` MUST fetch from Paddle API (customer/business/addresses) and then persist.

Freshness:
- Store `lastSyncedAt` and `syncSource` ("webhook" | "fetch").
- Billing tab may optionally backfill if snapshot is missing/stale.

### Applies to future invoices only
Edits made in this app apply only to **future invoices**. Show helper note:
> "Changes apply to future invoices. For already-issued invoices, submit a request and our team will update it manually."

### DB Additions (Prisma)
Add model:

```prisma
model TenantBillingProfile {
  tenantId String @id
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Locked, tax-critical fields (set by Paddle checkout; not editable in-app)
  countryCode String @db.VarChar(2)
  postalCode  String? @db.VarChar(32)

  // Editable fields (future invoices)
  region       String? @db.VarChar(80)
  city         String? @db.VarChar(80)
  addressLine1 String? @db.VarChar(120)
  addressLine2 String? @db.VarChar(120)
  companyName  String? @db.VarChar(160)
  vatId        String? @db.VarChar(64)

  // Provider linkage
  providerCustomerId String? @db.VarChar(191)
  providerBusinessId String? @db.VarChar(191)
  providerAddressId  String? @db.VarChar(191)

  // Snapshot freshness
  lastSyncedAt DateTime?
  syncSource   String? @db.VarChar(40) // "webhook" | "fetch" | "manual"

  updatedByUserId String?
  updatedAt DateTime @updatedAt
  createdAt DateTime @default(now())

  @@index([providerCustomerId])
  @@index([lastSyncedAt])
}

API

- GET /api/billing/billing-details
  - Returns snapshot
  - If missing/stale and tenant has providerCustomerId, backfill from Paddle, then return
- PUT /api/billing/billing-details
  - Validates editable fields only
  - Updates Paddle customer/business/address for future invoices
  - Stores updated snapshot in DB
  - Sends notification email to PLATFORM_ADMIN_EMAILS
  - Writes AuditLog: tenant.billing.billing_profile_updated

Paddle integration rules

- Paddle remains source of truth.
- Update calls must never change Country/Postal from this app.
- If tenant has no providerCustomerId (no paid subscription yet), store editable fields only; apply at first checkout backfill stage.

🧷 Support Request for Existing Invoices
DB Additions

enum BillingSupportRequestType {
  INVOICE_BILLING_DETAILS_CHANGE
}

enum BillingSupportRequestStatus {
  OPEN
  IN_PROGRESS
  DONE
  REJECTED
}

model BillingSupportRequest {
  id String @id @default(cuid())
  tenantId String
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  type BillingSupportRequestType
  status BillingSupportRequestStatus @default(OPEN)

  providerInvoiceId String? @db.VarChar(191)
  providerTransactionId String? @db.VarChar(191)

  requestedData Json // what user wants changed
  note String? @db.VarChar(500)

  createdByUserId String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId, createdAt])
  @@index([status, createdAt])
}

API
- POST /api/billing/support-requests creates request and notifies Platform Admin.
Notifications
- Email to PLATFORM_ADMIN_EMAILS
- AuditLog action: tenant.billing.support_request_created

💳 Payments / Transactions UI & Storage
Existing model

BillingTransaction already exists and stores:
- providerTransactionId
- status
- totals
- providerInvoiceId, invoiceUrl

Rules
- Default list shows only status in ("completed") (exact mapping defined by Paddle).
- “Show all activity” toggle reveals ready/draft and total=0 transactions for advanced users only.
- For invoiceUrl:
  - If stored, open directly.
  - If missing but providerInvoiceId exists, fetch and store via Paddle API.

### Payment success source (required)
Define a single canonical “payment success” signal:

- Primary: `transaction.paid`
- Fallback: `transaction.completed` (only if `transaction.paid` is not emitted in this destination)

Payments UI default must show only successful payment transactions (paid/completed).
All Paddle transaction statuses must be normalized internally before rendering UI.

### BillingTransaction status normalization (required)
Raw Paddle status strings must NOT be used directly in application logic.

Webhook ingestion must normalize statuses into an internal enum:

PAID | COMPLETED | READY | DRAFT | CANCELED | FAILED | UNKNOWN

UI and entitlement logic must rely only on normalized internal status values.

  API
- GET /api/billing/transactions?filter=completed|all

🔁 Subscription Lifecycle & Change Plan
Core rules
- 1 subscription per tenant (provider="paddle").
- Change plan uses Paddle Update Subscription to switch price_id.
- Downgrade to Free schedules cancel at period end; entitlements switch at period end.

Add mapping (Plan ↔ Paddle price_id)
- Environment variables:
  - PADDLE_PRICE_ID_STARTER
  - PADDLE_PRICE_ID_PRO
  - PADDLE_PRICE_ID_ENTERPRISE
  - PADDLE_PRICE_ID_STARTER_OVERAGE_REQUEST (one-time price)

  API

  POST /api/billing/change-plan body:

  { "targetPlanCode": "free" | "starter" | "pro" | "enterprise", "effective": "immediate" | "next_period" }

  Behavior
- If target is starter/pro/enterprise:
  - If no subscription: initiate checkout session (reuse existing checkout route or call shared service)
  - If subscription exists: Update Subscription to switch price_id
- If target is free:
  - If subscription exists: set cancelAtPeriodEnd=true and pendingPlanCode="free", call Paddle cancel at period end
  - If no subscription: just set plan to free in internal state (no-op)

### Cancel reversal edge-case (required)

If a subscription has `cancelAtPeriodEnd=true` and the user upgrades to a paid plan before the period ends:

System must:
1) unset cancellation in Paddle
2) update DB fields:
   - cancelAtPeriodEnd = false
   - pendingPlanCode = null
3) then execute Update Subscription price change

This prevents accidental subscription termination after upgrade.

  Audit events
- tenant.billing.plan_change_requested
- tenant.billing.plan_changed
- tenant.billing.cancellation_scheduled

🧠 Metering & Enforcement (Requests / PDF / ZIP)
Request counting rule (keep from existing EPIC)

Count 1 when:
- Record transitions to PENDING_APPROVAL
Idempotency key:
- REQ_SUBMIT:${recordId}:${submitCount}

Paid-only rollover rules
- Only apply rollover when effective plan is paid (starter/pro/enterprise) AND subscription status allows access.

Pro fair-use
- Track if usedRequests > 2000 within period.
- Set TenantBillingState flag or dedicated table:
  - proFairUseBreachedAt
  - proFairUseBreachCountRolling90d
- Trigger warning email/in-app.
- After sustained breach (policy, e.g., 2 months), require upgrade to Enterprise at next renewal (soft enforcement) or block at policy threshold.

Enterprise hard cap
- If usedRequests >= 4000 within period: block with UPGRADE_REQUIRED or LIMIT_REACHED.

🗓️ Billing Periods (Anchor-aligned, not calendar month)
Change from old EPIC

Old EPIC used “calendar month UTC”.
NEW requirement: billing periods must align to the subscription’s currentPeriodStart/currentPeriodEnd (Paddle anchor).

Rules
- If tenant has active Paddle subscription with currentPeriodStart/currentPeriodEnd: use those.
- If no subscription (Free): use calendar month UTC (simple) OR rolling month; choose calendar month UTC.

TenantBillingState shape
Already modeled with @@id([tenantId, periodStart]).
Use periodStart = subscription currentPeriodStart (for paid) else month start.

🔁 Period Close + Rollover (Starter)
Period close does:
- Identify tenants whose periodEnd < now AND state OPEN
- Close period:
  - compute unused requests
  - compute rollover grant (paid only)
  - enforce maxAvailable=400
  - apply expiry=60d policy using a new rollover lot table (recommended) OR encode in ledger

  Recommended DB addition for expiry correctness

Add “rollover lots”:

model TenantRolloverLot {
  id String @id @default(cuid())
  tenantId String
  tenant Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  periodStart DateTime
  granted Int
  used Int @default(0)
  expiresAt DateTime

  createdAt DateTime @default(now())

  @@index([tenantId, expiresAt])
  @@index([tenantId, periodStart])
}

Then “available rollover” = sum(granted-used where expiresAt>now), capped by maxAvailable.

💸 Starter Overage Scheduling (Next Invoice)
When

A cron runs daily (or hourly) and for tenants nearing period end (e.g. periodEnd within next 24h) does:
- Compute overageUnits = max(0, usedRequests - (included + rolloverAvailableUsed))
- If overageUnits > 0:
  - Create Paddle one-time charge effective_from next_billing_period (so it appears on next renewal invoice)
  - Persist record TenantOverageCharge to ensure idempotence

DB addition

model TenantOverageCharge {
  id String @id @default(cuid())
  tenantId String
  periodStart DateTime

  meter MeterKey
  units Int
  unitPriceCents Int
  totalCents Int

  provider String @db.VarChar(30) // paddle
  providerChargeId String? @db.VarChar(191)

  status String @db.VarChar(40) // scheduled|billed|voided
  createdAt DateTime @default(now())

  @@unique([tenantId, periodStart, meter])
  @@index([tenantId, createdAt])
}

Paddle

Use “add one-time charge” API effective_from next_billing_period.

🪝 Webhooks (Persist-First + Replay-Safe)

### Webhook tenant mapping (required)

Tenant must be resolved deterministically from Paddle webhook payload:

Resolution order:
1) `custom_data.tenantId` from Transaction Checkout (primary source)
2) Fallback lookup by `providerCustomerId` in Subscription or TenantBillingProfile
3) If tenant cannot be resolved:
   - persist BillingEvent with tenantId = null
   - log investigation entry
   - STOP business processing (no crash)

Transaction Checkout creation MUST include:
custom_data: { tenantId }

Current webhook route is good; enforce this invariant in server handlers:
1. Insert BillingEvent (providerEventId unique) with payload before processing business updates.
2. Business processing uses DB transaction, and MUST be idempotent.

Events to handle (minimum)
- transaction.completed → upsert BillingTransaction; ensure subscription linkage; store invoiceUrl/providerInvoiceId
- transaction.ready / draft / updated → store optionally (for “all activity” view), but do NOT affect entitlements
- subscription.created / updated → update Subscription.currentPeriodStart/End, status, cancelAtPeriodEnd, provider ids
- subscription.canceled → set Subscription.status=CANCELED; entitlements to free after grace rules
- payment method change events may produce zero-value transactions; store but do not confuse payments UI default filter.

Tenant mismatch behavior

If handler cannot map to tenant (missing custom data/workspaceId mapping):
- store BillingEvent with tenantId null (investigation)
- do not crash

Replay

Create internal platform-only endpoint:
- POST /api/internal/billing/replay-webhook-event with providerEventId
- It loads BillingEvent.payload and re-runs business handler idempotently.

🔐 Security

- All tenant billing endpoints require:
  - session auth
  - requireFullSession(session) (MFA gated)
  - tenant.billing.manage permission for current tenant
- Webhook endpoint remains public but signature-verified.
- Internal crons secured by CRON_SECRET Bearer auth (middleware bypass already present).
- Rate-limit internal endpoints.
- Do not store PII beyond minimal billing profile fields needed (address/company/VAT).

⚡ Performance

- Summary endpoints O(1) using counters + billing state (no ledger scans)
- Ledger append-only; counters updated atomically
- Proper indexes (already present; add indexes for new tables)
- Period close and overage scheduling must be batch-safe and chunked (limit tenants per run)

🧾 Audit Logs (Required)

Write AuditLog for:
- checkout initiated
- plan change requested
- plan changed (after webhook confirms)
- cancellation scheduled
- billing details updated
- support request created
- period closed
- overage scheduled
Use consistent action codes:
- tenant.billing.*

🧪 Testing Plan (Sandbox)

- Checkout starter/pro/enterprise via modal → verify:
  - subscription created
  - currentPeriodStart/End stored
  - BillingTransaction completed stored
  - invoiceUrl opens PDF
- Update payment method → verify zero-value ready transaction stored but not shown in default list
- Change plan starter→pro via update subscription → verify single subscriptionId remains and planCode updates
- Downgrade to free → cancelAtPeriodEnd true; access continues until period end; then switches to Free
- Starter usage > included → schedule overage charge → verify next invoice includes it
- Rollover: unused carries forward, expires after 60 days, cap 400
- Pro usage > 2000 → fair use flags + notifications; no overage charges
- Enterprise usage > 4000 → hard cap blocks
- Webhook replay endpoint can reprocess an event safely

✅ Definition of Done

- Schema migrations applied and seeded plan catalog updated (includes enterprise + feature rules)
- Tenant context resolution is used everywhere (no default-tenant billing operations)
- Change plan API works for starter/pro/enterprise and schedules cancel for free
- Payments UI: completed list default; advanced view shows all statuses
- Invoice open works and stores invoiceUrl
- Billing profile edit works (future invoices) and stored in DB
- Support request flow works and notifies platform admin
- Period close cron + overage scheduling cron implemented, secure, idempotent
- Webhook processing is persist-first and replay-safe
- Full audit coverage for all billing actions
- Tests cover: plan transitions, idempotency, rollover expiry/cap, overage scheduling, fair-use, enterprise cap

