# J1 — Pricing Plan Configuration & Tenant Subscription

## Scope

- Define Free / Starter / Pro in Plan.featuresJson or dedicated fields
- Subscription at tenant level


---

# Definition of Done

## Model

- Plan table exists with:
  - code (FREE | STARTER | PRO)
  - featuresJson with flags and limits
- Exactly one active Subscription per Tenant
- Subscription.planId determines the active plan
- Subscription.priceOverrideMonthly may exist (optional)
- New tenant always starts in FREE plan


---

## Capability Resolution

Central function exists:

resolveTenantPlan(tenantId)

Returns:

- planKey
- limits (requests, exports, etc.)
- feature flags (audit, zip, search…)

All usage validations must go through this function.


---

## Usage Counters

Usage is tracked by:

TenantUsageMonthly:
- requestsCreated
- exportsGenerated

Rules:

- Counters increment only if the action succeeds
- Increment must be atomic
- Counters reset per yearMonth


---

## Gating

Before allowing:

- create request
- export PDF
- export ZIP

The system validates:

- active plan
- available monthly limit
- feature flag enabled

If validation fails → clear error:

"Upgrade required"


---

## Minimum UI (v1)

Settings → Plan page

Displays:

- current plan
- limits
- current usage
- “Upgrade” button (even if billing is not implemented yet)


---

## Audit

AuditLogs are generated for:

- tenant.plan.assigned
- tenant.plan.changed
- tenant.billing.price_override_set


---

# Acceptance Criteria


## Free

- New tenant starts in Free

Can:

- create up to 10 requests per month
- export 1 PDF/month with watermark
- unlimited users/approvers
- external approvals enabled
- basic audit log
- no ZIP bundle

When attempting:

- 2nd export
- request #11

Returns error:

"Upgrade required"


---

## Starter

- Requests up to 200
- Exports up to 50
- Payment status + proof enabled
- Full-text search enabled
- AuditLog visible (limited, e.g., last 90 days)
- Watermark: NO (recommended to remove)


---

## Pro

- Requests unlimited (or high cap)
- Exports unlimited
- ZIP bundle enabled
- Full AuditLog
- No watermark
- Everything unlocked


---

# Edge Cases


## Plan Change

Upgrade:
- applies immediately

Downgrade:
- does not delete data
- only blocks new actions if limits are exceeded


---

## Month Change

- Counters reset automatically per yearMonth


---

## Invalid / Inactive Plan

If subscription.isActive = false:

- internal error + log entry


---

## Price Override

- Does not affect features or limits
- Only affects billing


---

# Pricing Strategy


## Free — “Try it, but feel the pain”

- 1 workspace
- Unlimited users/approvers
- Requests/month: 10
- PDF exports: 1 (with watermark)
- Basic evidence file storage limit
- External approvals enabled
- AuditLog visible: basic only
- No ZIP bundle

Goal:
Users should use it seriously but quickly hit meaningful limits.


---

## Starter — “Small team using it seriously”

- 1 workspace
- Unlimited users/approvers
- Requests/month: 200
- PDF exports: 50
- Payment status + proof enabled
- Manual reminders enabled
- Full-text search enabled
- AuditLog view limited (e.g., last 90 days)
- Watermark optional (or removed)

Suggested price:

$49 – $79 / month

(For 30–200 employees, $59 usually feels comfortable for self-serve.)


---

## Pro — “Audit-ready / compliance / full control”

- 1 workspace
- Unlimited users/approvers
- Requests/month: unlimited (or 2,000 soft cap)
- PDF exports: unlimited
- Audit bundle ZIP enabled
- Full AuditLog
- Roadmap priority + future advanced configurations

Suggested price:

$149 – $249 / month


---

# Architectural Rules

1. Do not hardcode plan logic outside resolveTenantPlan
2. Validate limits before executing actions
3. Increment counters only if the action succeeds
4. Downgrades never delete historical data
5. System prepared for future Stripe integration


---

# Future (Not v1)

- Overage billing
- Add-ons
- Multiple workspaces per tenant
- Seat-based pricing
- Dynamic feature toggles
