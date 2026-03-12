# API Security

## Purpose

Defines security rules for all API endpoints.

Ensures APIs remain resilient against abuse, misuse, and exploitation.

## Scope

Applies to all Route Handlers and server-side endpoints.

---

# Core Security Rules

## 1. Rate Limiting

Critical endpoints must enforce rate limits.

Examples:

- login endpoints
- external approval endpoints
- export generation
- reminder sending

Recommended rate limit tiers:
Public endpoints: strict
Authenticated endpoints: moderate
Internal endpoints: relaxed

---

## 2. Idempotency

Sensitive mutations must support idempotency.

Examples:

- payment status updates
- approval submissions
- webhook processing

---

## 3. Request Size Limits

APIs must enforce request size limits.

Examples:
JSON payload limit
file upload size limit

---

## 4. Content-Type Enforcement

APIs must validate expected content types.

Example:
application/json
multipart/form-data

Unexpected content types must be rejected.

---

## 5. Anti-Enumeration

APIs must avoid revealing whether resources exist.

Example:

Prefer returning:
404

instead of confirming existence.

---

## Implementation Guidance

All endpoints must include:

- authentication validation
- authorization checks
- tenant isolation enforcement
- input validation

---

## Related Documents

- ../GEMINI.md
- ./application-security.md
