# Authorization: RBAC and Request Access Rules

## Purpose
Defines the authorization model of the application.

The system uses two layers of authorization:

1. Tenant RBAC permissions
2. Request-level access rules

Both layers must always be enforced server-side.

---

# Tenant RBAC

Roles:

- OWNER
- ADMIN
- FINANCE
- MEMBER

---

## Role Responsibilities

OWNER  
Full tenant control.

ADMIN  
All permissions except billing.

FINANCE  
Can manage:

- requests
- approvals
- payments
- user invites

Cannot manage:

- roles
- billing configuration

MEMBER  
Limited access focused on request creation.

---

# Permission Catalog

Tenant admin:
tenant.audit.read
tenant.billing.manage
tenant.settings.manage
tenant.roles.read
tenant.roles.manage
tenant.users.read
tenant.users.invite
tenant.users.manage
tenant.users.disable


Requests:
tenant.requests.create
tenant.requests.read_all
tenant.requests.close
tenant.requests.share
tenant.requests.link
tenant.requests.export
tenant.requests.comment

Evidence:
tenant.evidence.add


Approvals:
tenant.approvals.assign_internal
tenant.approvals.assign_external
tenant.approvals.remind


Payments:
tenant.payments.manage


---

# Request Access Rules

A user may access a request if ANY condition is true:

- the user created the request
- the user is an assigned internal participant
- the user has shared access
- the user has `tenant.requests.read_all`

---

## Required Helper

Implement a shared helper:
canAccessRequest({ tenantId, userId, requestId })


This helper must be used by all request endpoints.

---

## Creator-Only Approval Management

Members can assign approvers only for requests they created.

Rules:
isCreator(request, user)
OR
hasPermission("tenant.approvals.assign_internal")


Approval actions themselves are governed by assignment.

---

## Consistency Rules

Unauthorized users must not learn whether a request exists.

Prefer returning:
404


when access is missing.

---

## Related Documents

- ../GEMINI.md
- ./security-multitenancy.md
