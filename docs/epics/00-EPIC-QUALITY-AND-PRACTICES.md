# Epic Quality, Security & Scalability Practices

This document defines **cross-cutting requirements** that apply to all epics. It complements the Naming & Permission Alignment and the `.cursor/rules` so that implementations enforce **quality**, **efficiency at scale**, **security**, and **structure**.

This document also establishes the **minimum production-grade security baseline for a multi-tenant B2B SaaS**.

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
- **MFA gating (2FA)**: Every **protected** API route (any route that requires an authenticated session) must enforce **full session** before returning data or performing mutations. A session is not full when the user has 2FA enabled and has not yet completed the MFA challenge (e.g. session is `PENDING_MFA` or `totpEnabled && !mfaVerified`). Use the shared helper `requireFullSession(session)` from `@/server/require-full-session` immediately after `getServerSession(authOptions)`; if it returns a response, return it (401 with `details.code: "MFA_REQUIRED"`). **Exceptions**: Only endpoints that explicitly must accept a PENDING_MFA session (e.g. `POST /api/auth/2fa/verify` to submit the MFA code, or `POST /api/auth/2fa/cancel` to sign out from the 2FA screen) may skip this check. All other `/api/*` routes under account, tenant, records, settings, workspaces, etc. must use `requireFullSession`. When adding **new** API routes that require authentication, always add the MFA gate unless the route is one of the documented exceptions.
- **Tenant**: Resolve tenant from membership server-side; never trust client `tenantId`. Filter every query by `tenantId`.
- **Authorization**: Check permission and, for request-scoped actions, **C1 access** (e.g. `canAccessRequest`). Return 403 or 404 (prefer 404 when hiding existence).
- **Input**: Validate all inputs with **Zod** (body and query params). Reject invalid with 400 and consistent error shape.
- **Secrets**: Never store raw tokens; store only hashed (e.g. invitation token, approval token). No secrets in logs or audit metadata.
- **Output**: Do not expose cross-tenant data, internal IDs unless necessary, or token values. Escape/sanitize user-generated content (e.g. comments) for XSS.
- **Rate limiting**: Apply to external-facing or abuse-prone endpoints (e.g. external approval link, manual reminder). Use 429 and standard error shape when limited.

---

### 3.1 SQL Injection Protection (Mandatory)

- Use Prisma ORM for all database operations.
- `$queryRaw` and `$executeRaw` are prohibited unless strictly necessary.
- If raw SQL is used:
  - Must use parameterized queries.
  - String concatenation is forbidden.
- Dynamic ORDER BY or filter fields must use allowlists.
- Never interpolate user input into SQL strings.

---

### 3.2 Object-Level Security (IDOR Prevention)

- Every resource fetch must validate:
  - tenant isolation
  - membership
  - permission
  - request-scoped access (when applicable)
- Resource access must never rely solely on ID.
- Prefer 404 over 403 when hiding resource existence.
- Cross-tenant access must be impossible.

---

### 3.3 CSRF Protection

If authentication is cookie-based:

- CSRF protection must be enabled.
- SameSite cookies must be enforced.
- Mutating endpoints must require CSRF validation.
- Do not disable built-in CSRF protections from the auth provider (e.g., NextAuth).

If authentication uses Bearer tokens:

- CORS policy must be strictly enforced (see 3.5).

---

### 3.4 XSS Protection (Strict)

- React auto-escaping must not be bypassed.
- `dangerouslySetInnerHTML` is prohibited unless explicitly reviewed.
- If supporting markdown:
  - Disable raw HTML.
  - Use allowlisted sanitizer.
- Never render raw HTML from DB without sanitization.

---

### 3.5 MFA Gating on Protected API Routes (Mandatory)

All API routes that require an authenticated session must also require a **full** session (2FA completed when the user has 2FA enabled). Otherwise a user who has signed in but not yet completed the 2FA challenge could call those APIs and access or mutate data.

**Rule:**

- Immediately after `getServerSession(authOptions)` in any protected route handler, call `requireFullSession(session)` from `@/server/require-full-session`.
- If it returns a non-null response, return it (401 with message and `details.code: "MFA_REQUIRED"`).
- Apply this to **every** new authenticated API route (account, tenant, records, settings, workspaces, and any future domains).

**Exceptions (do not use `requireFullSession`):**

- `POST /api/auth/2fa/verify` — must accept PENDING_MFA so the user can submit the MFA code and complete login.
- `POST /api/auth/2fa/cancel` — accepts any session state so the user can sign out from the 2FA screen.

**Public or unauthenticated routes** (e.g. `/api/health`, `/api/tenant/invitations/validate`, NextAuth callback) are unchanged.

See also: **Security 2FA and Sessions** epic (`docs/epics/security/security-2fa-sessions.md`).

---

### 3.6 CORS Policy

- Production must use explicit origin allowlist.
- `*` is forbidden in production.
- Allow only required HTTP methods.
- Allow only required headers.

---

### 3.7 Security Headers (Production Required)

Application must configure:

- `Content-Security-Policy`
- `X-Frame-Options` or `frame-ancestors`
- `X-Content-Type-Options: nosniff`
- `Referrer-Policy`
- `Permissions-Policy`
- `Strict-Transport-Security (HSTS)`

HTTPS required outside local development.

---

### 3.8 File Upload Security (Evidence)

- Validate MIME type server-side.
- Enforce max file size.
- Restrict allowed extensions.
- Prevent zip bombs.
- Scan files for malware (async recommended).
- Store files in isolated storage.
- Use signed URLs with expiration.
- Never expose raw bucket URLs.

---

### 3.9 SSRF Protection

If backend fetches URLs:

- Allow only `https`.
- Block private IP ranges.
- Block localhost and metadata endpoints.
- Enforce request timeout.
- Enforce max response size.

---

### 3.10 Session Hardening

- Cookies must be `HttpOnly`, `Secure`, `SameSite=Lax` or `Strict`.
- Sessions must expire.
- Sensitive actions (billing, ownership transfer, role change) require re-auth.
- Login endpoints must be rate-limited.
- Support per-user inactivity timeout (sliding) for accounts that enable it; enforce server-side using session lastActivityAt and force logout mechanism.
- MFA gating / step-up (sesión PENDING_MFA vs FULL, y “step-up ≤10 min” para acciones sensibles).
- Session rotation after completing MFA (new token/session).
- Remembered device tokens como una segunda cookie separada de sesión (hash en DB + expiración 30/60/90 + revocación en “security reset”).
- Server-side revocation con revokedAt y forced logout con forceLogoutAt.
- Throttle writes de lastActivityAt (no escribir en cada request).
- Cookie naming hardening: usar prefijo __Host- para el token de “remember device”.

---

### 3.11 Token Security (Invites / External Links)

- Tokens must be hashed in DB.
- Tokens must have expiration.
- Support one-time use where applicable.
- Token validation responses must be generic.
- Rate limit token endpoints.
- strong random token
- hash SHA-256 en DB
- explicit expiration
- revocable
- generic responses

---

### 3.12 Data Protection & Privacy

- All traffic must use HTTPS.
- Database encryption at rest.
- Object storage encryption at rest.
- No secrets in logs.
- PII must be redacted in logs.
- Audit logs must be append-only.
- Define log retention policy.

---

### 3.13 Supply Chain Security

- Dependency vulnerability scanning enabled.
- Block deploy on critical vulnerabilities.
- Enable secret scanning in repository.
- Keep dependencies updated.
- Avoid unmaintained packages.

---

## 4. Performance & scalability (supporting millions of users)

- **Indexes**: Every list or filter must use indexed columns. Epics must list **required** indexes (e.g. `(tenantId, createdAt DESC)`, `(tenantId, status)`, `(requestId, userId)`). No “recommended” without a “required” set for the epic’s main queries.
- **Pagination**: All list endpoints must be paginated (cursor-based preferred for consistency and stability). Specify max page size and enforce it.
- **Queries**: Prefer `select` over broad `include`. Avoid N+1: use batched loads or JOINs. Use consistent ordering for pagination.
- **Transactions**: Keep transactions short. No heavy loops inside a transaction. Use atomic updates for counters (e.g. usage consume).
- **Long-running work**: Export PDF/ZIP or bulk operations that may take > few seconds should be designed for async (e.g. job queue + polling or webhook). Epics may defer implementation but should call out “async recommended.”
- **Connection and pooling**: Handled at runtime/DB layer; epics do not need to specify, but implementations must not hold connections across long operations.

- **Caching** (for speed and efficiency):
  - **Do cache** (when safe): Plan/limits resolution per request (e.g. `resolveTenantPlan` result for the same tenantId within one request); static or rarely changing reference data (e.g. plan definitions) with short TTL and clear invalidation.
  - **Do not cache** (without explicit design): Tenant-scoped list or detail responses (stale data risk); anything that must reflect immediate writes (mutations, access changes); raw tokens or secrets.
  - Prefer request-scoped or short-TTL caches; document invalidation and tenant isolation for any shared cache. Use platform primitives (e.g. React `cache()`, Next `unstable_cache`) where they respect request/tenant boundaries.

- **Client-side fetch (React)** — keep best performance and avoid duplicate requests:
  - In development, React Strict Mode double-mounts components, so any `useEffect` that fetches data runs twice. To avoid redundant network calls and flicker (e.g. empty state then data), **always cancel in-flight fetches on effect cleanup**.
  - **Pattern**: In `useEffect`, create an `AbortController`, pass `controller.signal` to `fetch` (or to your API client that forwards it to `fetch`). In the effect cleanup, call `controller.abort()`. Only update state (e.g. set data, set loading false) when `!signal.aborted`, so the cancelled request does not change UI state.
  - Apply this to every client-side data fetch triggered by `useEffect` (e.g. list loads, tenant/permissions providers, infinite scroll initial load). Use the same pattern for “load more” / pagination: guard with a ref (e.g. `loadingMoreRef`) to prevent concurrent requests with the same cursor, and deduplicate appended items by id when merging pages.
  - This is standard React practice: cleanup side effects in the effect return; it reduces wasted work in dev and avoids updating unmounted components. Do not disable Strict Mode to avoid double fetches.

---

## 5. API contract (all API-facing epics)

- **Validation**: Zod for every request payload and for query parameters. Reject invalid with **400**.
- **Error shape** (from rule 60):
  ```json
  { "error": { "code": "SOME_CODE", "message": "Human readable message", "details": {} } }
  ```
- **HTTP codes**: 400 validation, 401 unauthenticated, 403 forbidden, 404 not found / no access, 409 conflict (e.g. duplicate slug), 429 rate-limited, 500 server error.
- **Standard error codes**: Use consistent `code` values so clients and support can rely on them (see Section 6).

### 5.1 Validation error messages (user-facing)

Validation errors (400, `VALIDATION_ERROR`) must expose **only short, user-friendly text** in the `message` field. The UI must never show raw Zod output or internal wording.

- **Do not expose**: `"Validation failed:"`, field paths (e.g. `code:`), or Zod defaults like `"expected string to have <=10 characters"`.
- **Do expose**: A single, human-readable sentence the user can act on (e.g. `"Must be 10 characters or less."`, `"Must be at least 6 characters."`, `"Please enter a valid email address."`).
- **Implementation**: Use the shared `parseBody` and `ValidationError` from `@/lib/validations/common`. `parseBody` turns the first Zod issue into a formatted message (see `formatValidationMessage`). Route handlers must not catch Zod and rethrow with the raw message; let `withErrorHandler` map `ValidationError` to the API error shape.
- **Fallback**: If a legacy or unknown validation message is caught (e.g. string starting with `"Validation failed:"`), return the generic `"Please check the value and try again."` instead of forwarding the technical text.

Apply this for all new and updated API validation so every feature shows the same clean format in the UI.

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
| `STEP_UP_REQUIRED` | 403 | Recent MFA required |
| `MFA_CHALLENGE_EXPIRED` | 401 | Pending MFA expired |
| `NO_PENDING_2FA_SETUP` | 409 | Verify called without setup |

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

## 9. Infrastructure & Environment Baseline

- Separate dev, staging, production environments.
- Secrets managed via secret manager or environment variables.
- No secrets in repository.
- Database access follows least privilege principle.
- Backups must exist and restore must be tested.
- Production logs must not expose sensitive data.
- Monitoring and alerting must exist for:
  - Error spikes
  - Repeated failed logins
  - Rate-limit abuse
  - Unexpected 5xx increases

---

## 10. Security Definition of Done (Global)

An epic is not complete unless:

- Tenant isolation enforced
- Object-level authorization enforced
- No SQL injection risk
- No XSS vectors
- CSRF mitigated
- Security headers configured
- Required indexes exist
- Pagination enforced
- Rate limiting applied where needed
- Sensitive actions audited
- No privilege escalation possible