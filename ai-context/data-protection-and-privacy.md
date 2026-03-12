# Data Protection and Privacy

## Purpose

Defines how sensitive data, personal data, and tenant data must be handled.

Ensures the system protects user privacy and minimizes unnecessary data exposure.

---

# Scope

Applies to:

- user data
- tenant data
- personally identifiable information (PII)
- logs and telemetry
- database storage

---

# Core Principles

## 1. Data Minimization

The system must only collect data that is strictly necessary for functionality.

Avoid collecting:

- unnecessary personal details
- sensitive identifiers
- irrelevant metadata

---

## 2. PII Protection

Personally identifiable information must be handled carefully.

Examples of PII:

- names
- emails
- phone numbers
- billing addresses

Rules:

- store only when necessary
- avoid logging PII
- restrict access via RBAC

---

## 3. Data Isolation

Tenant data must remain isolated.

All queries must enforce tenant scoping using:
tenantId
workspaceId

Cross-tenant data exposure is strictly forbidden.

---

## 4. Encryption

Sensitive data must be encrypted where appropriate.

Examples:

- database encryption at rest
- encrypted storage
- encrypted network traffic

Transport encryption must always use HTTPS.

---

## 5. Data Retention

Data must not be stored indefinitely without purpose.

Recommended policy:

- audit logs retained for defined periods
- inactive accounts archived or removed
- expired tokens deleted

---

## 6. Data Deletion

Users must be able to request deletion of their data when required.

Deletion should include:

- user profile
- personal data
- associated tokens

Audit logs may remain if legally required.

---

## 7. Backup Security

Backups must be protected.

Rules:

- encrypted storage
- restricted access
- secure backup locations

---

## Implementation Guidance

Developers must always consider:

- whether the data being stored is necessary
- whether the data should be encrypted
- whether the data should expire

Avoid storing sensitive data unless absolutely required.

---

## Related Documents

- ../GEMINI.md
- ./security-multitenancy.md
- ./secrets-and-cryptography.md