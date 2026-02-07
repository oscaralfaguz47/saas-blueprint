# K1 — AuditLog Integration

## Scope

- Log sensitive actions across the product, including:
  - create tenant
  - invite user
  - role changes
  - exports (PDF / ZIP)
  - payment status changes
- Ensure logs are consistent, queryable, and secure
- Restrict audit log visibility to privileged roles only (permission: `tenant.audit.read`)


---

# Definition of Done


## AuditLog Data Model

AuditLog table exists and is used as the single source of truth for audit events.

Minimum fields (best practice):

- id
- tenantId
- occurredAt (UTC)
- actorType (USER | SYSTEM | EXTERNAL)
- actorUserId (nullable)
- actorEmail (nullable, snapshot)
- actorIp (nullable)
- actorUserAgent (nullable)
- actionKey (string, e.g., `tenant.created`)
- entityType (string, e.g., Tenant, User, Request, Export, Payment)
- entityId (nullable)
- metadataJson (JSON)
- correlationId / traceId (nullable)
- severity (INFO | WARNING | CRITICAL)

Rules:

- actorEmail is stored as a snapshot (so audits remain readable even if email changes)
- metadataJson must be schema-consistent per actionKey
- occurredAt must be stored in UTC
- AuditLog entries are immutable (no updates, no deletes in app-level flows)

Indexes (minimum):

- (tenantId, occurredAt DESC)
- (tenantId, actionKey, occurredAt DESC)
- (tenantId, entityType, entityId, occurredAt DESC)


---

## Action Catalog (v1)

System must create AuditLog entries using **canonical action keys only**. See `docs/epics/00-NAMING-AND-PERMISSION-ALIGNMENT.md`.

### Tenant

- `tenant.created`
- `tenant.plan.assigned`
- `tenant.plan.changed`
- `tenant.billing.price_override_set`

### Invites / Membership

- `tenant.user.invited`
- `tenant.invite.accepted`
- `tenant.invite.resent`
- `tenant.invite.revoked`
- `tenant.user.disabled`
- `tenant.role.changed`

### Requests

- `request.created`
- `request.closed`

### Evidence

- `request.evidence.file_added`
- `request.evidence.link_added`

### Approvals

- `request.approval.internal_assigned`
- `request.approval.external_sent`
- `request.approval.approved`
- `request.approval.rejected`
- `request.reminder.sent`

### Payments

- `request.payment.status_set`
- `request.payment.evidence_added`
- `request.payment.evidence_removed`

### Exports

- `request.export.pdf_generated`
- `request.export.bundle_generated`
- `export.blocked.upgrade_required` (optional but recommended)

### Comments (optional)

- `request.comment.added`


---

## Metadata Consistency

Each `actionKey` must have a stable metadata schema.

Examples (minimum recommended):

### `tenant.role.changed`

metadataJson:

- targetUserId
- targetEmail
- oldRole
- newRole

### `request.export.pdf_generated`

metadataJson:

- exportType: "PDF"
- recordId (if applicable)
- fileId / blobKey (if applicable)
- watermarkApplied (bool)

### `request.payment.status_set`

metadataJson:

- paymentId
- oldStatus
- newStatus
- reason (nullable)


---

## Write Rules

- Audit logs must be written **only after the action succeeds**
- Prefer writing audit log in the same transaction when possible
- If a transaction is rolled back, the audit log must not persist
- If the action is executed asynchronously, correlate with traceId/correlationId


---

## Access Control

Audit log visibility is controlled by permission:

- `tenant.audit.read`

Rules:

- Owner/Admin: can view audit logs (has permission)
- Member: cannot view audit logs (no permission)

Audit log endpoints / queries must enforce:

- tenant scoping
- permission check on every request


---

## UI Minimum (v1)

Audit Log page (Tenant scoped):

- Filter by:
  - date range
  - actionKey
  - actor
- List shows:
  - occurredAt
  - actor (email or SYSTEM)
  - action label
  - entity reference
  - basic metadata summary
- Detail drawer/modal shows full metadataJson (read-only)


---

# Acceptance Criteria

- AuditLog entries are created with consistent metadata for sensitive actions:
  - create tenant
  - invite user
  - role changes
  - exports
  - payment status changes

- Only privileged roles can view audit logs:
  - Owner/Admin: YES
  - Member: NO

- Audit logs are tenant-isolated:
  - No tenant can access another tenant’s logs

- Audit logs are immutable:
  - No edit / delete through application flows

- Logs are queryable and performant:
  - Most recent logs load fast (indexed by tenantId + occurredAt)


---

# Edge Cases

- Actor user is deleted:
  - audit log remains readable via stored actorEmail snapshot

- External approver actions:
  - actorType = EXTERNAL
  - store actorEmail + tokenId or inviteId (in metadata)

- System actions (automations / background jobs):
  - actorType = SYSTEM
  - actorUserId null
  - include job name in metadata


---

# Best Practices

- Use UTC timestamps always
- Keep metadataJson structured (no free-form text as primary data)
- Add correlationId/traceId for debugging multi-step flows
- Store snapshots for actor identifiers (email/name) to preserve history
- Keep actionKey naming consistent (namespace style: `domain.action.verb`)


---

# Future Enhancements (Not v1)

- Retention policy (e.g., 365 days for Starter, unlimited for Pro)
- Export audit logs (CSV/PDF)
- Webhook / SIEM integration
- Alerting rules (e.g., repeated failed export attempts, role escalation)
