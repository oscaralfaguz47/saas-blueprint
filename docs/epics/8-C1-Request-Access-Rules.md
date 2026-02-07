# C1 — Request Access Rules

## Scope

Define and enforce request visibility rules.

A user can access a request if ANY of the following is true:

- The user is the creator
- The user is an internal participant (e.g., approver)
- The request was explicitly shared with the user (request_access)
- The user has elevated permission (finance/admin read_all)


---

# Definition of Done


## Central Access Function

A reusable function exists:

canAccessRequest(tenantId, userId, requestId)

Rules:

- Must be the single source of truth for request access validation
- Must be reused across:
  - Get request by ID
  - List queries
  - Update request
  - Approve / reject
  - Export
- Must be tenant-scoped


---

## Visibility Logic

A user can access a request if:

1. request.createdByUserId == userId
OR
2. user is internal participant (e.g., approver assigned)
OR
3. request_access record exists for (requestId, userId)
OR
4. user has permission:
   - `tenant.requests.read_all`
   - OR role Finance/Admin equivalent


---

## Data Model Requirements

### Request

- id
- tenantId
- createdByUserId
- ...

### RequestParticipants (internal)

- requestId
- userId
- role (APPROVER | VIEWER | etc.)

### RequestAccess (explicit share)

- requestId
- userId
- grantedByUserId
- accessType (VIEW | EDIT)
- createdAt

Indexes (recommended):

- (requestId, userId) UNIQUE
- (tenantId, createdByUserId)
- (tenantId, requestId)


---

## List Queries Enforcement

All list queries must:

- Filter by tenantId
- Filter by access logic

NEVER:

- Return all tenant requests and filter in memory

Access filtering must be enforced at query level.


---

## Testing Requirements

- Unit tests for canAccessRequest
- Integration tests for:
  - Get by ID
  - List endpoints
- At minimum, clearly defined manual test scenarios


---

# Acceptance Criteria

- If User A creates a request:
  - User B cannot see it by default

- If User B is assigned as internal approver:
  - User B can see it

- If User B is shared as viewer via request_access:
  - User B can see it

- Finance/Admin:
  - Always can see all tenant requests

- Member without relationship:
  - Cannot see it
  - API returns 403 or 404 (recommended: 404 to avoid information leakage)


---

# Security Rules

- All access checks must include tenantId validation
- Never trust frontend visibility rules
- Always enforce access on backend
- Prefer returning 404 instead of 403 when user is not allowed to see existence


---

# Edge Cases

- User removed from tenant:
  - Loses access immediately
- User role downgraded:
  - Access re-evaluated dynamically
- Request deleted:
  - No access (404)
- Request moved to another tenant (if ever allowed):
  - Access recalculated under new tenant scope


---

# Performance Considerations

- Avoid N+1 access checks
- Use EXISTS subqueries or JOINs for access filtering
- Index:
  - (requestId, userId)
  - (tenantId, createdByUserId)

- Access logic must scale to thousands of requests per tenant


---

# Best Practices

- Keep access logic centralized
- Do not duplicate logic across controllers/services
- Use permission-based overrides (`read_all`)
- Make access rules explicit and deterministic
- Avoid complex dynamic conditions inside controllers


---

# Future Enhancements (Not v1)

- External approver access via token
- Time-limited shared access
- Field-level visibility
- Access expiration rules
- Access audit logging (e.g., request.viewed)
