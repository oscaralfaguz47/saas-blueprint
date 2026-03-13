# Audit Log

## Purpose
Defines the audit logging system for sensitive operations.

Audit logs provide accountability and traceability.

---

# Core Rules

Audit logs are:

- append-only
- immutable
- never deleted

---

# Required Fields

Each audit entry must include:

- actorUserId
- actorContext
- tenantId
- action
- metadata

---

# Sensitive Event Types

Examples:

Tenant:
tenant.created
tenant.plan.changed

Users:
tenant.user.invited
tenant.invite.accepted
tenant.user.disabled


Requests:
request.created
request.closed


Approvals:
request.approval.approved
request.approval.rejected

Exports:
request.export.pdf_generated


---

# Security Constraints

Audit logs must never store:

- raw tokens
- secrets
- unnecessary PII

External tokens must be **hashed**.

---

## Related Documents

- ../GEMINI.md