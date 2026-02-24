# EPIC 4-Refactor-Epics-1-and-2 — Paddle Checkout + In-App Billing Center (No Address Stored)
> Implements a frictionless Paddle overlay checkout and a post-purchase Billing Center exactly like n8n.
> MUST follow **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

## 🎯 Objective

Refactor the current billing flow to match **n8n’s UX pattern**:

1) User clicks **Change plan** → sees plan selector modal (already OK, no changes required)
2) User clicks **Upgrade** (already OK, no changes required)
3) **Immediately open Paddle checkout overlay/modal** (n8n-style) with:
   - Step "Your details": Email + Country (Country required)
   - Step "Payment": payment options + card fields
   - "Add VAT number" appears inside payment step (Paddle UI behavior)
4) On completion:
   - show a brief "Setting up account…" state (like n8n) without leaving the context
   - redirect/refresh Billing tab: `/app/settings/workspace?tab=billing&billing=updated`
5) Billing tab shows:
   - Transaction history (completed transactions)
   - Each row has **Open** → opens Paddle hosted receipt/invoice (`my.paddle.com/invoice/...`)
   - Payment method section + **Change payment method** button → opens Paddle update payment method overlay/modal (or safe fallback)

CRITICAL: Remove the current “Activate plan” modal that collects contact/address/tax details and remove ALL related code and DB objects.

---

## ✅ Scope

### Included
- Remove internal billing address/business profile capture completely
- Paddle overlay checkout initiated from inside app (no internal “activate plan” form)
- Transaction history list in Billing tab with “Open invoice” links
- “Change payment method” action using Paddle-provided flow
- Webhook-driven subscription truth + transaction capture
- Strong tenant isolation, idempotency, PII minimization, audit logs, tests

### Not Included
- Rendering invoices inside our UI (we link out to Paddle receipt page)
- Building our own VAT/address capture UI
- Stripe implementation
- Annual billing toggles / proration logic (Paddle handles)
- Seat/add-on pricing

---

## 🔥 UX Parity Requirements (match n8n)

### Checkout overlay/modal (n8n behavior)
- Overlay opens from billing modal flow (no full-page redirect)
- First screen asks only:
  - Email (pre-filled with user email)
  - Country (required)
- VAT button appears in Payment step ("Add VAT number") controlled by Paddle UI
- After successful payment, show "Setting up account…" loading state in the same overlay context and then return to Billing tab.

### Billing Center (n8n behavior)
- Billing tab displays:
  1) **Transaction history** list (date, status, amount due, Open button)
  2) **Payment method** card (brand, last4, expiry if available)
  3) “Change payment method” opens a Paddle-managed UI (overlay if possible)

---

## 🧱 Architecture (Provider abstraction preserved)

- J3 remains Billing Truth (enforcement, counters, usage, rollover)
- This epic updates only:
  - `Subscription`
  - `BillingEvent` (sanitized)
  - `BillingTransaction` (new) for invoice URL + display data
  - `AuditLog`

No provider coupling in J3 enforcement logic.

---

## 🗃️ Data Model Changes (Prisma)

### 1) REMOVE BillingProfile (hard delete)
We must delete the `BillingProfile` model and any references.

**Delete from schema:**
- `model BillingProfile { ... }`
- `Tenant.billingProfile BillingProfile?`

**Migration must:**
- Drop `BillingProfile` table
- Remove all foreign keys and indexes referencing it

**Delete all code paths** that:
- create/update BillingProfile
- validate address/tax fields
- store paddleAddressId/paddleBusinessId
- read billing profile for checkout

### 2) ADD BillingTransaction (new)
We need a dedicated table to power the Billing “Transaction history” list and Open invoice link.

```prisma
model BillingTransaction {
  id String @id @default(cuid())

  tenantId String
  tenant   Tenant @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  provider String @db.VarChar(30) // "paddle"
  providerTransactionId String @unique @db.VarChar(191) // txn_...

  status String @db.VarChar(40) // e.g. "completed", "paid", "refunded" (store normalized display state)
  billedAt DateTime?

  currency String @db.VarChar(10)
  subtotalCents Int
  taxCents Int
  totalCents Int

  invoiceUrl String? @db.VarChar(600) // my.paddle.com/invoice/... (receipt page)
  receiptNumber String? @db.VarChar(120) // optional display

  // Minimal context - no PII (no full email, no address)
  planCode String? @db.VarChar(50) // from signed metadata
  subscriptionId String? // optional link
  providerSubscriptionId String? @db.VarChar(191)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@index([tenantId, billedAt])
  @@index([tenantId, status])
  @@index([provider, providerSubscriptionId])
}

3) DO NOT add any address/VAT fields anywhere

No country, postal code, VAT number storage in our DB for billing purposes.

🔌 API Endpoints (App Router)
A) Checkout (overlay-first)

POST /app/api/billing/paddle/checkout/route.ts

Input:
{ "planCode": "starter" | "pro" }
Output:
{
  "transactionId": "txn_...",
  "environment": "sandbox" | "production"
}

Rules:

- Auth required, tenant.billing.manage
-Resolve tenant server-side
- Validate planCode
- Disallow checkout for free
- Do not create Subscription here (webhook-only truth)
- Must create a Paddle Transaction server-side and return transaction id

IMPORTANT:

- Do NOT pass address/business/tax fields to Paddle from our DB (we removed them).
- Only pass:
  - customer email/name
 - items (price_id)
 - custom_data: { tenantId, planCode }
 - collection_mode: "automatic"
 - currency_code
 - optional: customer_id (get-or-create by email)

 B) Portal / Update payment method session

POST /app/api/billing/paddle/portal/route.ts

Input:

{ "mode": "general" | "update_payment_method", "subscriptionId"?: "sub_..." }

Output:
{ "url": "https://..." }

Rules:

- Auth required, tenant.billing.manage
- Uses providerCustomerId from Subscription
- Creates Paddle customer portal session (or equivalent) and returns URL
- UI opens this in overlay if supported; otherwise open in new tab

NOTE:

- If Paddle supports a dedicated “update payment method overlay” via Paddle.js, prefer that.
- If not supported reliably, the fallback is portal session URL.

C) Transactions list (new)

GET /app/api/billing/transactions/route.ts

Output:

{
  "transactions": [
    { "id": "...", "billedAt": "...", "status": "Completed", "total": { "cents": 2400, "currency": "USD" }, "invoiceUrl": "..." }
  ]
}

Rules:

- Auth required
- Tenant isolation: only current tenant
- Pagination optional (start with last 50)

🧠 Webhook Processing (Paddle)

We already have strong webhook verification logic; keep it and extend:

Must capture:

- Subscription lifecycle events (existing)
- transaction.completed (or equivalent) to upsert BillingTransaction

Transaction extraction

From verified payload, extract:
- providerTransactionId (txn_...)
- status
- billedAt / createdAt
- totals (subtotal, tax, total) in cents
- currency
- invoice/receipt url if present in payload
- providerSubscriptionId if present
- metadata tenantId + planCode (only from signed payload)

If invoice/receipt URL is not present in webhook payload:

- Store providerTransactionId and create an internal “Open” URL strategy:
  - Prefer any URL included by Paddle
  - If not available, store null and rely on Paddle portal for invoice access
  - UI must handle missing invoiceUrl gracefully (show “View in portal”)

  Idempotency

- Keep BillingEvent.providerEventId unique
- BillingTransaction.providerTransactionId unique
- If transaction already exists, update totals/status safely

PII minimization

- Do not store:
  - full addresses
  - full names beyond what’s needed (prefer none)
  - full emails in BillingTransaction (avoid)
- BillingEvent payload must be sanitized (existing rules)

🖥️ UI Changes
1) REMOVE “Activate plan” modal completely

Delete:

- UI components
- endpoints that power it
- zod schemas
- server actions
- DB references (BillingProfile)
- any validations for postal/state/city/address/VAT/GST

2) Upgrade click opens Paddle overlay (n8n-style)

In your existing plan selector/upgrade flow:

- On “Upgrade”:
1. call POST /api/billing/paddle/checkout → get transactionId
2. ensure Paddle.js is initialized with NEXT_PUBLIC_PADDLE_CLIENT_TOKEN
3.open overlay:
  - Paddle.Checkout.open({ transactionId, settings: { displayMode: "overlay" } })
4.Listen to events:
  - completed → redirect to /app/settings/workspace?tab=billing&billing=updated
  - closed/canceled → redirect to /app/settings/workspace?tab=billing&billing=canceled

  IMPORTANT:

- Do NOT show our own billing details form.
- Country is required and must be captured by Paddle UI in the overlay.

3) Billing tab: add Transaction history section

In /app/settings/workspace?tab=billing:

- Add a “Payments” section like n8n:
  - Transaction history table (Date, Status, Amount Due, Open button)
  - Open button opens invoiceUrl in new tab
- Add Payment method section:
  - Shows currently known method (if we can fetch via Paddle portal/session or via webhook info)
  - Button “Change payment method”:
    - call /api/billing/paddle/portal with { mode: "update_payment_method" }
    - open returned url in an overlay-style dialog if technically possible
    - fallback: open in new tab

4) “Setting up account…” interim state

After checkout completes, show a brief in-place loading indicator (like n8n):

- Copy: “Setting up account…”
- Duration: until Billing tab loads and fetches updated subscription/transactions
- Must not block navigation if the fetch fails; show toast and allow retry

🔐 Security Requirements

- Tenant isolation on all routes
- Webhook signature verification mandatory
- Idempotent webhook processing
- No PII stored in BillingTransaction or logs
- Do not log checkout URLs or transaction IDs in client console
- Rate limit checkout/portal routes
- Webhook route: POST only, content-type enforcement, body size limit, replay window checks (keep existing)

🧪 Testing
Unit/Integration

-Checkout endpoint returns transactionId; rejects free; enforces permission
-Webhook:
  - invalid signature → reject
  - duplicate providerEventId → no side effects
  - transaction.completed → upserts BillingTransaction
  - tenant mismatch attempt → no mutation + security log/metric

  UI/E2E (Playwright)

- Upgrade opens Paddle overlay (mock Paddle.js or run sandbox)
- Close/cancel returns to billing with billing=canceled toast
- Complete returns to billing with billing=updated and transaction appears
- Open invoice button opens external invoiceUrl
- Change payment method opens portal/update flow

✅ Acceptance Criteria (Exact)

1. The internal “Activate plan” modal (contact/address/VAT/etc.) is fully removed:
- no UI
- no endpoints
- no schema/model
- no DB table
2. Upgrade opens Paddle overlay directly and asks only Email + Country initially.
3. VAT entry is handled only by Paddle UI (“Add VAT number” in payment step).
4. Billing tab shows transaction history with “Open” → Paddle invoice/receipt page.
5. “Change payment method” triggers Paddle-managed update flow.
6. Subscription remains webhook-truth (no local state hacks).
7. No billing address data is stored in our DB.

🧹 Removal Checklist (Must Do)

- Prisma:   
  - Remove BillingProfile model and relation from Tenant
  - Migration drops BillingProfile table
- Server:
  - Delete any /api/billing/profile/ endpoints and validations
  - Delete any services that create paddleAddressId/paddleBusinessId
- UI:
  - Delete “Activate plan” modal components
  - Remove all fields: postal code, region/state, city, address lines, company name, VAT/GST, etc.
  - Remove any validations for postal/state/city/address/VAT/GST
- Docs: 
  - Deprecate old flow sections in EPIC 2/3 and replace with this epic’s behavior

  📌 Implementation Notes (Cursor guidance)

- Keep existing Paddle signature verification code unchanged unless required.
- Introduce BillingTransaction only for display + invoice linking.
- Prefer opening Paddle overlay via transactionId returned by server.
- If Paddle portal cannot be embedded due to X-Frame-Options:
  - open in new tab as fallback
  - keep UI consistent with a modal trigger and explanation copy

  Definition of Done

- All acceptance criteria met
- Migrations applied cleanly
- Tests pass
- No references to BillingProfile remain in codebase
- Billing tab UX matches n8n behavior closely
- Production-ready security posture maintained

