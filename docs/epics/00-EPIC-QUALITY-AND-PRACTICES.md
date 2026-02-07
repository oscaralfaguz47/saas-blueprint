# Epic Quality, Security & Scalability Practices

This document defines **cross-cutting requirements** that apply to all epics. It complements the Naming & Permission Alignment and the `.cursor/rules` so that implementations enforce **quality**, **efficiency at scale**, **security**, and **structure**.

---

## 1. Relationship to rules

When implementing any epic, the following rules **always apply**:

| Rule | Scope |
|------|--------|
| `00-architecture.mdc` | App Router, Route Handlers, no Server Actions, server-first |
| `10-security-multitenancy.mdc` | Auth, tenant resolution, never trust client, platform-blocked users |
| `20-authz-rbac-access.mdc` | RBAC + request access (C1), shared helpers, creator-only rules |
| `30-plans-usage-billing.mdc` | resolveTenantPlan, assertWithinPlanLimit, usage counters |
| `40-auditlog.mdc` | Canonical audit action keys, append-only, permission to read |
| `50-prisma-performance.mdc` | select over include, no N+1, atomic updates, index-aware queries |
| `60-api-validation-errors.mdc` | Zod for payload and query params, error shape, HTTP codes, rate limiting |
| `70-ui-ux-contract.mdc` | Loading / empty / error states, upgrade-required UX |
| `90-definition-of-done.mdc` | Build, types, authZ, Zod, audit for sensitive actions |

Epics specify **what** to build; these rules specify **how** to build it. If an epic is silent on a topic (e.g. pagination), the rules and this doc apply.

---

## 2. Epic structure checklist

Every epic should address the following where applicable. Missing sections reduce clarity and increase implementation drift.

| Section | Purpose |
|--------|---------|
| **Scope** (Included / NOT Included) | Clear boundaries; avoid scope creep |
| **Authorization rules** | Who can do what; required permission + C1 when request-scoped |
| **Data model** | Tables, fields, constraints, **indexes** (required, not optional) |
| **Transaction rules** | Single transaction, rollback on failure, order of operations |
| **Audit logging** | Canonical action key(s); see 00-NAMING-AND-PERMISSION-ALIGNMENT.md |
| **Validation** | Input rules (required fields, max length, enums); Zod in implementation |
| **Edge cases** | Closed request, duplicate, not found, concurrent requests |
| **Performance / indexes** | Indexes for list filters, access checks, pagination; no N+1 |
| **Security** | Tenant isolation, no leakage, token hashing, rate limit where needed |
| **Definition of Done** | Testable completion criteria |
| **Acceptance criteria** | Given/When/Then where useful |

Use **shared helpers** (e.g. `canAccessRequest`, `resolveTenantPlan`, `tryConsumeRequest`) instead of re-describing logic in every epic.

---

## 3. Security (all epics)

- **Auth**: Every API handler must validate session; reject unauthenticated with 401.
- **Tenant**: Resolve tenant from membership server-side; never trust client `tenantId`. Filter every query by `tenantId`.
- **Authorization**: Check permission and, for request-scoped actions, **C1 access** (e.g. `canAccessRequest`). Return 403 or 404 (prefer 404 when hiding existence).
- **Input**: Validate all inputs with **Zod** (body and query params). Reject invalid with 400 and consistent error shape.
- **Secrets**: Never store raw tokens; store only hashed (e.g. invitation token, approval token). No secrets in logs or audit metadata.
- **Output**: Do not expose cross-tenant data, internal IDs unless necessary, or token values. Escape/sanitize user-generated content (e.g. comments) for XSS.
- **Rate limiting**: Apply to external-facing or abuse-prone endpoints (e.g. external approval link, manual reminder). Use 429 and standard error shape when limited.

---

## 4. Performance & scalability (supporting millions of users)

- **Indexes**: Every list or filter must use indexed columns. Epics must list **required** indexes (e.g. `(tenantId, createdAt DESC)`, `(tenantId, status)`, `(requestId, userId)`). No “recommended” without a “required” set for the epic’s main queries.
- **Pagination**: All list endpoints must be paginated (cursor-based preferred for consistency and stability). Specify max page size and enforce it.
- **Queries**: Prefer `select` over broad `include`. Avoid N+1: use batched loads or JOINs. Use consistent ordering for pagination.
- **Transactions**: Keep transactions short. No heavy loops inside a transaction. Use atomic updates for counters (e.g. usage consume).
- **Long-running work**: Export PDF/ZIP or bulk operations that may take > few seconds should be designed for async (e.g. job queue + polling or webhook). Epics may defer implementation but should call out “async recommended.”
- **Connection and pooling**: Handled at runtime/DB layer; epics do not need to specify, but implementations must not hold connections across long operations.

---

## 5. API contract (all API-facing epics)

- **Validation**: Zod for every request payload and for query parameters. Reject invalid with **400**.
- **Error shape** (from rule 60):
  ```json
  { "error": { "code": "SOME_CODE", "message": "Human readable message", "details": {} } }
  ```
- **HTTP codes**: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found / no access, 409 conflict (e.g. duplicate slug), 429 rate-limited, 500 server error.
- **Standard error codes**: Use consistent `code` values so clients and support can rely on them (see Section 6).

---

## 6. Standard error codes

Use these `error.code` values where applicable so clients can handle them consistently (e.g. show upgrade CTA, or “request closed” message).

| Code | HTTP | When to use |
|------|------|-------------|
| `UPGRADE_REQUIRED` | 402 or 403 | Plan limit exceeded (requests, exports); show upgrade CTA |
| `REQUEST_CLOSED` | 400 or 409 | Action not allowed because request is CLOSED |
| `ALREADY_RESPONDED` | 409 | Approver already approved/rejected |
| `INVITATION_EXPIRED` | 400 | Invite or external approval link expired |
| `LINK_REVOKED` | 400 | External approval link revoked |
| `PAYMENT_NOT_SUPPORTED` | 400 | Request type is not payable |
| `REJECTION_COMMENT_REQUIRED` | 400 | Reject action requires a non-empty comment |
| `REMINDER_RATE_LIMITED` | 429 | Reminder sent too recently |
| `RATE_LIMITED` | 429 | Generic rate limit (e.g. token validation) |

Epics that trigger these should reference the code by name (e.g. “Return 403 with code `UPGRADE_REQUIRED`”).

---

## 7. Quality and observability

- **No silent failures**: Do not swallow DB or external errors. Map known errors to 4xx/409 with clear messages.
- **Logging**: Log unexpected errors (with correlation/trace id if available). Do not log secrets or full PII.
- **Metrics** (where useful): Counters for business events (e.g. request created, export generated, consume blocked) help support and capacity planning. J2-style metrics (success/blocked/failed) are a good pattern for gated actions.
- **Testing**: Critical paths (authZ, C1, plan gating, atomic consume) should have unit or integration tests. Epics can state “Must be covered by tests for access and gating” where relevant.

---

## 8. Summary: what to add in epics

- **Every epic**: Explicit “Required indexes” for main queries; reference to this doc and to the relevant rules.
- **List/filter epics (C2, C3, C4, K1 audit list)**: Pagination (cursor + max page size), no N+1.
- **Mutation epics**: Transaction boundaries, atomic updates where applicable, canonical audit key, and standard error code (e.g. `UPGRADE_REQUIRED`, `REQUEST_CLOSED`) when applicable.
- **Public or token-based endpoints (e.g. E3)**: Rate limiting and generic error on invalid token (no info leakage).
- **Export / heavy operations (I1, I2)**: Async design note if sync would block for > few seconds; idempotency or rate limit to avoid double-click abuse.

Adding one line at the top of each epic (e.g. “Implement per 00-EPIC-QUALITY-AND-PRACTICES.md and .cursor/rules.”) keeps these practices in scope for every implementation.
