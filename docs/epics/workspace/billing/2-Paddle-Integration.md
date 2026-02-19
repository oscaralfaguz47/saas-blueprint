# 2 — Paddle Integration (Checkout, Webhooks, Subscription Sync, Portal) — Production-Grade

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

# 🎯 Epic Objective

Integrate **Paddle.com** as the subscription billing provider for workspace plans (Free / Starter / Pro), fully connected to the **provider-agnostic billing core (J3)**.

This epic implements:

- Paddle Checkout (subscription creation)
- Paddle Webhook verification (signature validation mandatory)
- Subscription lifecycle sync
- Idempotent event processing
- Mapping Paddle events → internal `SubscriptionStatus`
- Period synchronization (`currentPeriodStart`, `currentPeriodEnd`)
- Grace handling
- Cancel at period end handling
- Customer portal link
- Billing UI integration in:

/app/settings/workspace?tab=billing

- Full security hardening
- Full tenant isolation
- Production-grade error handling
- Stripe-ready architecture (provider abstraction preserved)

⚠️ J4 does NOT implement Stripe.  
⚠️ J4 must NOT modify J3 enforcement logic.

---

# 🏗️ Architecture Overview

J4 must plug into J3 without coupling.

## Provider Abstraction Rule

J3 = Billing Truth  
J4 = Paddle Adapter

J4 must only:

- Update `Subscription`
- Insert `BillingEvent`
- Trigger AuditLog
- Never modify usage counters directly
- Never compute overage
- Never compute rollover

---

# 📁 File Structure (Exact Locations)

## Server

/server/billing/providers/paddle/
create-checkout-session.ts
verify-webhook-signature.ts
handle-webhook-event.ts
map-paddle-event.ts
get-customer-portal-link.ts
paddle-types.ts


## API Routes

/app/api/billing/paddle/checkout/route.ts
/app/api/billing/paddle/webhook/route.ts
/app/api/billing/paddle/portal/route.ts


All must:

- Validate session (except webhook)
- Use Zod
- Enforce tenant isolation
- Use consistent error shape
- Use idempotency
- Apply strict security headers

---

# 📌 Implementation Notes (Actual Behavior)

This section reflects the **implemented** behavior and official Paddle APIs used. No SDK; native `fetch` and Node `crypto` only.

## Checkout

- **Create Customer:** `POST https://api.paddle.com/customers` (or `https://sandbox-api.paddle.com/customers`). Body: `email`, `name`, `custom_data` (e.g. `tenantId`). Response: `data.id` (customer id).
- **Create Transaction:** `POST https://api.paddle.com/transactions`. Body: `customer_id`, `items` (array of `{ price_id, quantity: 1 }`), `custom_data: { tenantId, planCode }`, `collection_mode: "automatic"`, `currency_code` (e.g. `"USD"`). Response: `data.checkout.url` — **this is the hosted checkout URL returned to the client.** Price IDs come from env: `PADDLE_PRICE_ID_STARTER`, `PADDLE_PRICE_ID_PRO`.
- Subscription record is **not** created in our DB at checkout; it is created/updated only via webhook.

## Customer Portal

- **Create Customer Portal Session:** `POST https://api.paddle.com/customers/{customer_id}/portal-sessions`. Body (optional): `subscription_ids` array. Response: portal URL in `data.url` or `data.urls.general` or `data.urls.customer_portal` (implementation tries these in order).

## Webhook

- **Raw body first:** Read request body with `request.text()` (no JSON parse before verification).
- **Signature:** Header `Paddle-Signature` format `ts=<unix>;h1=<hex>`. Signed payload = `ts:rawBody`. HMAC-SHA256 with webhook secret; compare with timing-safe equality. Support `PADDLE_WEBHOOK_SECRET_CURRENT` and `PADDLE_WEBHOOK_SECRET_PREVIOUS` for rotation.
- **Replay:** Timestamp `ts` must be within ±5 minutes of current time.
- **After verification:** Parse JSON, validate envelope and subscription data with Zod. Idempotency: if `BillingEvent` with same `providerEventId` exists, return 200 and do not mutate.
- **Method:** POST only (405 otherwise). **Content-Type:** `application/json` (415 otherwise). **Body size:** max 2 MB (413 otherwise).

## Subscription sync (J4 only)

- J4 **only** upserts `Subscription`, inserts `BillingEvent` (sanitized payload, no PII), and writes `AuditLog` when `BILLING_WEBHOOK_ACTOR_USER_ID` is set. J4 does **not** modify usage counters, enforce limits, or compute overage (those remain in J3).

---

# 🔐 Security Requirements (MANDATORY)

## Webhook Signature Verification

Must verify Paddle webhook signature.

- Use Paddle’s official HMAC verification
- Use raw request body (do NOT parse JSON before verification)
- Reject if signature invalid (400)
- Never trust event payload before verification

### Webhook Origin Hardening (Allowlist / Network Controls)

- **Origin allowlist (preferred when available):**
  - If Paddle provides stable webhook IP ranges or a documented allowlist mechanism, enforce it at the edge (WAF / firewall / platform middleware).
  - If IPs are not guaranteed stable, do NOT rely solely on IP allowlists; signature verification remains mandatory.

- **Method enforcement:**
  - Webhook route must accept **POST only**.
  - Any other method must return **405 Method Not Allowed**.

- **Content-Type enforcement:**
  - Accept only `application/json` (or the exact content type documented by Paddle).
  - Reject unsupported content types with **415 Unsupported Media Type**.

- **Request body size limits:**
  - Enforce a maximum body size (e.g., 1–2 MB).
  - Reject oversized payloads with **413 Payload Too Large**.


## Idempotency

- Use `BillingEvent.providerEventId` as unique
- If event already processed → return 200 immediately
- No double subscription updates

## CORS

Webhook route:
- Must NOT allow public CORS
- Must only accept POST
- No wildcard

## Rate Limiting

Webhook:
- Minimal (provider-controlled)
Checkout + Portal:
- Standard authenticated rate limit

---

# 📦 Paddle Configuration (Environment Variables)

PADDLE_API_KEY
PADDLE_WEBHOOK_SECRET
PADDLE_ENVIRONMENT=sandbox|production
PADDLE_VENDOR_ID (if required by SDK)


Must validate environment on startup.

### Secret Rotation (No-Downtime Support)

- Support webhook secret rotation using:

  - `PADDLE_WEBHOOK_SECRET_CURRENT`
  - `PADDLE_WEBHOOK_SECRET_PREVIOUS` (optional during rotation window)

- Verification flow:
  1. Attempt verification with CURRENT secret.
  2. If verification fails and PREVIOUS exists, attempt with PREVIOUS.
  3. If both fail → reject request.

- Operational policy:
  - During secret rotation, maintain both secrets active for a limited overlap window (e.g., 24–72 hours).
  - Remove PREVIOUS secret after overlap window ends.


---

# 🧾 Checkout Flow

## Endpoint

POST /api/billing/paddle/checkout


## Authorization

- Must be authenticated
- Must pass `requireFullSession`
- Must have `tenant.billing.manage`
- Must resolve tenant server-side

## Payload

```json
{
  "planCode": "starter" | "pro"
}

Validation

- Must exist in Plan
- Cannot checkout free
- Must not already have active subscription for same plan
- Must not downgrade directly via checkout (downgrades handled separately)

Flow

1. Resolve tenant
2. Resolve plan
3. Create Paddle checkout session:
- Customer email
- Customer name
- Metadata:
  - tenantId
  - planCode

4. Return hosted checkout URL

Do NOT create Subscription record yet.
Subscription record created/updated via webhook only.

🔁 Webhook Processing
Endpoint
POST /api/billing/paddle/webhook

# Must Use Raw Body
Next.js App Router:
- Disable body parsing
- Read raw body
- Verify signature
- THEN parse JSON

### Replay Protection (Timestamp Window)

- If Paddle includes a signed timestamp header or payload field:
  - Enforce a strict validation window (e.g., ±5 minutes).
  - Reject events outside the allowed window with **400** and a generic error response.

- If no reliable timestamp is available:
  - Enforce replay resistance via:
    - `providerEventId` idempotency (unique constraint already required).
    - Optional alerting if repeated duplicate events exceed normal thresholds.

- Replay protection must execute **after signature verification** but **before subscription state mutation**.


🧠 Supported Paddle Events

Must handle:

- subscription.created
- subscription.updated
- subscription.canceled
- subscription.past_due
- subscription.resumed
- transaction.completed
- subscription.trialing (if used)
- subscription.activated
Events not recognized:
- Log + ignore safely

🔄 Mapping Paddle → Internal Status

Map to:

SubscriptionStatus

| Paddle   | Internal  |
| -------- | --------- |
| active   | ACTIVE    |
| trialing | TRIAL     |
| past_due | PAST_DUE  |
| paused   | SUSPENDED |
| canceled | CANCELED  |

### Event Schema Validation (Zod) Before Any Mutation

- After **signature verification** (and replay window validation if available), validate the webhook JSON payload with **Zod** before:
  - inserting `BillingEvent`
  - upserting `Subscription`
  - writing `AuditLog`

- Validation rules:
  - Must validate **event type** (allowlist of supported Paddle event types).
  - Must validate required identifiers:
    - `providerEventId` (string, max length)
    - `providerSubscriptionId` (string)
    - `providerCustomerId` (string, optional depending on event type)
  - Must validate period fields when present:
    - `current_period_start` and `current_period_end` are valid ISO timestamps
    - `start < end`
  - Must validate metadata:
    - `tenantId` is present and a valid cuid (or your tenant id format)
    - `planCode` in {"free","starter","pro"} (note: webhook for checkout must never assign "free")
  - Must reject unknown critical shapes with **400** and a generic message (no sensitive details).

- Error handling:
  - Invalid schema → return 400 with `error.code = "VALIDATION_ERROR"` (clean user-safe message).
  - Do not store raw invalid payloads unless explicitly sanitized and needed for debugging (prefer storing minimal diagnostics only).

- Placement: Insert this section under **Webhook Processing**, immediately after **Replay Protection (Timestamp Window)** (or after raw-body verification if replay protection is not available).


### Security Monitoring & Alerting Hooks

- Implement lightweight monitoring counters for webhook processing outcomes:
  - `webhook.signature_invalid.count`
  - `webhook.replay_rejected.count`
  - `webhook.schema_invalid.count`
  - `webhook.idempotent_duplicate.count`
  - `webhook.process_success.count`
  - `webhook.process_failure.count`

- Logging rules:
  - Log only: providerEventId, eventType, result, and a correlation id.
  - Do not log full payload or PII.

- Alert thresholds (production):
  - Signature invalid spike: e.g. > 10/min → alert
  - Schema invalid spike: e.g. > 10/min → alert
  - Process failures spike (5xx): e.g. > 5/min → alert
  - Tenant mismatch attempts (see below): any non-zero rate → alert

- Placement: Insert under **Security Requirements (MANDATORY)** after **Rate Limiting** (or after the new Origin Hardening / Replay / PII sections if you prefer grouping security topics).


### Abuse Detection & Tenant-Mismatch Heuristics (Webhook Integrity)

- Guard against malicious or malformed attempts to affect other tenants.

- Mandatory checks:
  - Extract `tenantId` only from **signed metadata** (post signature verification).
  - Validate the tenant exists and is ACTIVE (or allow SUSPENDED if you still need to process cancelation events).
  - Verify that the incoming `providerSubscriptionId` is either:
    - not yet linked to any tenant (new subscription), OR
    - already linked to the **same tenantId**
  - If `providerSubscriptionId` is linked to a different tenant → treat as **security incident**:
    - Do not mutate subscription state
    - Return 200 (to avoid provider retries storm) OR 400 depending on your policy
    - Log `webhook.tenant_mismatch` metric and security audit entry (vendor-level log or dedicated security log)
    - Trigger alert

- Additional heuristics:
  - If planCode in metadata does not match Paddle product/price id mapping (when you add mapping):
    - reject update and alert (possible tampering)
  - If event attempts to set `free` plan via webhook:
    - reject and alert (free should be managed by app, not provider)
  - If event volume for one tenant exceeds normal patterns:
    - throttle processing and alert

- Placement: Insert under **Webhook Processing** (after schema validation) OR under **Subscription Sync Rules** before upsert, as a mandatory “pre-upsert guard”.


🧾 Subscription Sync Rules

On relevant webhook:

1. Extract:
- providerSubscriptionId
- providerCustomerId
- planCode (from metadata)
- current_period_start
- current_period_end
- status
2. Upsert Subscription:
- tenantId from metadata
- planId resolved by planCode
- provider = "paddle"
- providerCustomerId
- providerSubscriptionId
- status mapped
- currentPeriodStart
- currentPeriodEnd
3. Insert BillingEvent:
- providerEventId unique
- payload raw JSON
4.### PII Minimization + Payload Redaction

- Never persist raw payment instrument data (cards, bank details, tokens).
- Persist webhook payload in one of the following safe modes:

  **Mode A (recommended): Store sanitized subset only**
  - providerEventId
  - event type
  - subscription id
  - customer id
  - plan code
  - status
  - period start/end
  - timestamps
  - tenantId (derived safely)

  **Mode B: Store full payload but redact PII fields**
  - Remove or blank:
    - full name
    - full email (optional: hash instead)
    - address
    - IP
    - payment instrument identifiers
    - any token values

- Logs must never print full webhook payload.
- Logs must include only:
  - event id
  - event type
  - tenantId (if safe)
  - processing result (success / ignored / failed).

5. Write AuditLog:
- action: tenant.billing.subscription_updated

All inside transaction.

⏳ Grace Period Handling

If Paddle marks:
- past_due
Then:
- Set Subscription.status = PAST_DUE
- Set graceUntil = now + configurable graceDays
J3 gating logic will handle access.

🔄 Cancel At Period End

If Paddle indicates scheduled cancellation:
- Set cancelAtPeriodEnd = true
- Do NOT change status until period ends
- UI must reflect “Canceling at period end”

🔓 Customer Portal
Endpoint

POST /api/billing/paddle/portal

Must:
- Auth + tenant.billing.manage
- Resolve providerCustomerId
- Generate Paddle customer portal link
- Return URL

🖥️ UI Changes in BillingTab

Add:

- “Upgrade” button → calls checkout endpoint
- “Manage Subscription” → calls portal endpoint
- Show subscription status
- Show next billing date
- Show cancelAtPeriodEnd flag
- Show past_due warning
- Show graceUntil date
No provider logic in UI.

⚡ Performance

- Webhook must process in <500ms
- No long transactions
- No heavy loops
- Idempotent
- Indexed lookups
Required indexes already exist:
- providerSubscriptionId
- providerEventId
- tenantId + status

🧪 Testing Requirements

Must test:
- Signature verification fails → 400
- Duplicate webhook event → ignored safely
- Subscription activation → Subscription created
- Plan upgrade → PlanId updated
- Past due → Status updated
- Cancel at period end → flag set
- Tenant isolation enforced
- No cross-tenant update possible
- Grace logic respected
### Additional Security Tests

- Method enforcement:
  - GET request to webhook endpoint → 405.
- Content-Type enforcement:
  - Invalid content type → 415.
- Body size enforcement:
  - Oversized payload → 413.
- Replay protection:
  - Event outside timestamp window → rejected.
  - Duplicate providerEventId → idempotent success with no side effects.
- PII protection:
  - Persisted BillingEvent payload must not contain PII fields.
- Secret rotation:
  - Event signed with CURRENT secret → accepted.
  - Event signed with PREVIOUS secret → accepted during rotation window.
  - Event signed with invalid secret → rejected.


🧾 Audit Events

Log:
- tenant.billing.checkout_initiated
- tenant.billing.subscription_created
- tenant.billing.subscription_updated
- tenant.billing.subscription_canceled
- tenant.billing.portal_accessed

🔒 Security Definition of Done

- Signature verified
- No trust of webhook without verification
- Idempotent processing
- No direct plan enforcement in J4
- Tenant isolation guaranteed
- No raw tokens logged
- No secrets in logs
- HTTPS enforced

🚫 Non-Goals

- No Stripe logic
- No invoice rendering
- No tax engine
- No seat-based pricing
- No annual plans
- No proration engine (handled by Paddle)

🧠 Architectural Principle

J4 updates Subscription state.
J3 reads Subscription state and enforces plan.
Provider logic must never leak into billing core.

🧪 Definition of Done

- Checkout endpoint working
- Webhook verified + idempotent
- Subscription sync correct
- Grace handling correct
- Portal working
- UI updated
- Tests passing
- No security gaps
- Production-ready

