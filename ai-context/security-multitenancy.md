# Security & Multi-Tenancy

## Purpose
Defines the security model and tenant isolation rules for the system.

Ensures strict data separation between tenants and protects the system from unauthorized access.

## Scope
Applies to all backend logic, API endpoints, database access, and UI exposure.

---

# Core Security Rules

## 1. Never Trust the Client

All security enforcement must happen on the **server**.

Client-side checks exist only for UX.

Examples of forbidden patterns:

- trusting tenantId sent from client
- trusting role flags sent from UI

---

## 2. Authentication Is Mandatory

All application routes require authentication.

Protected routes:
/app/**
/api/**


Exceptions:

/api/auth/**


Authentication must always be validated inside the endpoint.

---

## 3. Tenant Isolation Is Mandatory

All tenant-scoped data must be filtered by:

tenantId
or
workspaceId


Queries must never return data across tenants.

---

## 4. Tenant Resolution

Tenant context must always be resolved **server-side**.

Preferred resolution method:

1. read session user
2. query membership table
3. determine active tenant

Never trust tenant identifiers coming from the client.

---

## 5. Platform Blocked Users

If a user is marked as:

user.isPlatformBlocked === true


The system must:

- deny all tenant mutations
- return HTTP 403

---

## 6. Cross-Tenant Operations

Cross-tenant queries are forbidden unless explicitly authorized by platform-level endpoints.

These endpoints must:

- be isolated
- require elevated permissions

---

## Implementation Guidance

Every API handler must:

1. validate authentication
2. resolve tenant context
3. enforce tenant isolation
4. enforce permissions

Failure to apply tenant isolation is considered a **critical security bug**.

---

## Related Documents

- ../GEMINI.md
- ./authorization-rbac-and-request-access.md

