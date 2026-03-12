# Plans, Usage Limits, and Billing

## Purpose
Defines the subscription, plan, and usage enforcement model.

Ensures predictable billing behavior and prevents inconsistent usage tracking.

---

# Subscription Model

One workspace must have exactly **one subscription**.

Recommended DB constraint:
unique tenantId


---

# Usage Counters

Usage must be tracked in:

TenantUsageMonthly


Fields:

- tenantId
- yearMonth
- requestsCreated
- exportsGenerated

Counters must be updated **atomically**.

---

# Plan Gating

Before performing actions such as creating requests or exporting data, the system must:

1. resolve the tenant plan
2. verify plan is active
3. verify usage limit not exceeded

---

# Limit Exceeded Behavior

If limits are exceeded:

Return:
HTTP 402 or 403

Error code:
UPGRADE_REQUIRED


Mutations must not partially succeed.

---

# Plan Changes

Upgrade behavior:

- applied immediately

Downgrade behavior:

- does not delete data
- blocks actions exceeding new limits

---

# Pricing Overrides

Subscription may include override fields:
priceOverrideMonthly
discountNote
discountEndsAt


Overrides affect **price only**, not plan features.

---

## Related Documents

- ../GEMINI.md
- ./audit-log.md

