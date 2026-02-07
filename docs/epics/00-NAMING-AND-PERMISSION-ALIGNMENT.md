# Naming & Permission Alignment (Canonical Reference)

This document is the **single source of truth** for permission codes and audit-log action keys. All epics, rules, and code must align to these names.

- **Permissions**: Full tenant permission catalog is in **A2** and below; `docs/PERMISSIONS.md` may document a subset (e.g. platform vs tenant).
- **Audit**: Canonical action keys are also listed in `.cursor/rules/40-auditlog.mdc`.
- **Quality, security, scalability**: See **00-EPIC-QUALITY-AND-PRACTICES.md** for cross-cutting requirements and standard error codes.

---

## 1. Permission naming

**Pattern:** `tenant.<resource>.<action>`

- One permission per **capability area** (e.g. one permission for all export types, one for all payment actions).
- Use **manage** when the scope includes multiple sub-actions (status + evidence).

### Canonical permission list

| Area | Permission | Description |
|------|------------|-------------|
| **Tenant** | `tenant.audit.read` | View audit logs |
| | `tenant.billing.manage` | Manage billing, plans, subscriptions |
| | `tenant.settings.manage` | Manage workspace settings |
| | `tenant.roles.read` | View roles and permissions |
| | `tenant.roles.manage` | Create/edit roles and assign permissions |
| | `tenant.users.read` | View workspace users |
| | `tenant.users.invite` | Invite users to workspace |
| | `tenant.users.manage` | Edit/activate/deactivate members |
| | `tenant.users.disable` | Disable users (explicit action) |
| **Requests** | `tenant.requests.create` | Create requests |
| | `tenant.requests.read_all` | View all tenant requests (bypass access rules) |
| | `tenant.requests.close` | Close requests |
| | `tenant.requests.share` | Share request (create viewer access) |
| | `tenant.requests.link` | Link requests (G1 / G2) |
| | `tenant.requests.export` | Export request packet (PDF) and/or bundle (ZIP) |
| | `tenant.requests.comment` | Add comments on requests |
| **Evidence** | `tenant.evidence.add` | Attach evidence (files and links) |
| **Approvals** | `tenant.approvals.assign_internal` | Assign internal approvers |
| | `tenant.approvals.assign_external` | Send external approvals via email/token |
| | `tenant.approvals.remind` | Send manual reminders to pending approvers |
| **Payments** | `tenant.payments.manage` | Set payment status and manage payment evidence |

**Do not use:** `tenant.payments.set_status`, `tenant.payments.evidence.add`, `tenant.exports.pdf`, `tenant.exports.bundle` — use the canonical names above.

---

## 2. Audit-log action key naming

**Pattern:** `tenant.<entity>.<action>` or `request.<entity>.<action>`

- Use **request.** for request-scoped actions (evidence, approval, payment, export).
- Use **tenant.** for tenant/user/invite/plan/billing.
- Prefer past tense or clear verb: `created`, `invited`, `status_set`, `pdf_generated`.

### Canonical audit action list

| Domain | Action key | When to use |
|--------|------------|-------------|
| **Tenant** | `tenant.created` | Workspace created |
| | `tenant.plan.assigned` | Plan assigned to tenant |
| | `tenant.plan.changed` | Plan changed |
| | `tenant.billing.price_override_set` | Price override set |
| **Invites / users** | `tenant.user.invited` | Invitation created/sent |
| | `tenant.invite.accepted` | Invitation accepted |
| | `tenant.invite.resent` | Invitation resent |
| | `tenant.invite.revoked` | Invitation revoked |
| | `tenant.user.disabled` | Member disabled |
| | `tenant.role.changed` | Role assignment changed |
| **Requests** | `request.created` | Request created |
| | `request.closed` | Request closed |
| **Evidence** | `request.evidence.file_added` | File evidence attached |
| | `request.evidence.link_added` | Link evidence attached |
| **Approvals** | `request.approval.internal_assigned` | Internal approver assigned |
| | `request.approval.external_sent` | External approval sent |
| | `request.approval.approved` | Approval granted |
| | `request.approval.rejected` | Approval rejected |
| | `request.reminder.sent` | Reminder sent to approvers |
| **Payments** | `request.payment.status_set` | Payment status changed |
| | `request.payment.evidence_added` | Payment evidence added |
| | `request.payment.evidence_removed` | Payment evidence removed |
| **Exports** | `request.export.pdf_generated` | PDF packet generated |
| | `request.export.bundle_generated` | ZIP bundle generated |

**Do not use:** `tenant.invite.created` (use `tenant.user.invited`), `tenant.member.disabled` (use `tenant.user.disabled`), `tenant.member.role_changed` (use `tenant.role.changed`), `tenant.member.removed` (use `tenant.user.disabled`), `export.pdf.created` / `export.zip.created` (use `request.export.*`), `payment.status.changed` / `payment.proof.*` (use `request.payment.*`).

---

## 3. RequestEvent vs AuditLog

- **RequestEvent**: timeline / domain events; names can be more specific (e.g. `request.export.approval_packet_generated`). No need to change existing RequestEvent names in epics.
- **AuditLog actionKey**: must use **only** the canonical audit action keys from Section 2. One audit row per sensitive action; map internal event names to the canonical key when writing AuditLog.

---

## 4. Quick reference: epic → permission / audit

| Epic | Permission (use this) | Audit action (use this) |
|------|------------------------|-------------------------|
| H1 Payment status | `tenant.payments.manage` | `request.payment.status_set` |
| H2 Payment evidence | `tenant.payments.manage` | `request.payment.evidence_added` / `request.payment.evidence_removed` |
| I1 PDF export | `tenant.requests.export` | `request.export.pdf_generated` |
| I2 ZIP export | `tenant.requests.export` | `request.export.bundle_generated` |
| F1 Comments | `tenant.requests.comment` | (optional) `request.comment.added` |
| A3 Invite created | — | `tenant.user.invited` |
| A3 Invite accepted | — | `tenant.invite.accepted` |
| A3 Invite revoked | — | `tenant.invite.revoked` |
| A3 Member disabled | — | `tenant.user.disabled` |
| D1 File evidence | — | `request.evidence.file_added` |
| D2 Link evidence | — | `request.evidence.link_added` |
| E1 Internal approver | — | `request.approval.internal_assigned` |
| E3 External approver | — | `request.approval.external_sent` |
