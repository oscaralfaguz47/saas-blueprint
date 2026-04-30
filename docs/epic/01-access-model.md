# Relitrue EPIC ù Access Model (4-Axis)

> **Version:** 1.0 ù 2026-04-29  
> **Status:** Active  
> **Master Plan reference:** [00-master-plan.md](./00-master-plan.md), Decision D-001  
> **Implementing Phase:** B (schema + access model)

## Section 1 ù Why 4 Axes

Single-dimension RBAC breaks down for enterprise finance workflows because a single title often compresses multiple independent powers into one opaque bucket.

A classic example is "Finance Manager":

- Reads broad financial data
- Approves high-impact transactions
- Owns subscription and billing administration

Real organizations need to split these responsibilities across different people:

- Controller can approve but cannot touch billing subscription settings
- Procurement lead can process but cannot approve above threshold
- Operations admin can manage members and workspace settings but has no financial visibility

With one-dimensional role labels, this quickly causes role explosion:

- `FinanceManagerWithBilling`
- `FinanceManagerWithoutBilling`
- `FinanceViewer`
- `FinanceApprover`
- `FinanceApproverNoBillingDepartmentOnly`
- and many more variants over time

This approach is brittle, difficult to audit, and hard to maintain in code and UI.

Industry-standard enterprise systems (including Workday, Coupa, and Ramp) solve this by splitting authority into independent axes.

**Normative statement:** The 4 axes are independent. Any combination is theoretically valid, but some combinations make no business sense and are explicitly forbidden (see Section 6).

## Section 2 ù The 4 Axes

### 2.1 ù workspaceRole

Purpose: governs administrative actions on the workspace itself (members, settings, integrations).

| Value | Meaning | Allowed Actions |
| --- | --- | --- |
| `OWNER` | Workspace owner ù full administrative control | Everything in workspace, including delete workspace, transfer ownership, manage all members |
| `ADMIN` | Workspace administrator | Manage members (invite, remove, change roles), manage settings, manage finance teams, view audit logs |
| `MEMBER` | Standard workspace member | Create records, participate in workflows assigned to them, view their own data |

Constraints:

- A workspace MUST have at least 1 OWNER at all times.
- Transferring OWNER to another user demotes the previous owner to ADMIN (configurable).
- MEMBER cannot manage other members regardless of other axes.
- workspaceRole controls workspace governance only; it does not imply financial processing rights.


### 2.2 ù financialAccess

Purpose: governs WHAT financial data the user can SEE (visibility, not action).

| Value | Meaning | Records Visible |
| --- | --- | --- |
| `ALL` | All financial records in the workspace | Every record regardless of department, finance team, or owner |
| `DEPARTMENT` | Records associated with the user's TenantDepartment(s) | Records where the requesting record's department matches user's department(s) |
| `OWN_AND_PARTICIPATING` | Only records the user created or is a participant in (default for MEMBER) | Self-created + invited as approver/viewer |
| `NONE` | No financial visibility | No records visible (e.g., admin who only manages workspace, not finances) |

Constraints:

- This is VISIBILITY only ù does not grant action authority (see financeResponsibility).
- `DEPARTMENT` requires the user has at least 1 TenantDepartment assignment.
- OWNER's financialAccess is ALWAYS effectively ALL (cannot be restricted, configurable in v2).
- Visibility checks must always remain tenant-scoped at query boundary.


### 2.3 ù financeResponsibility

Purpose: governs WHAT financial actions the user can PERFORM.

| Value | Meaning | Allowed Actions |
| --- | --- | --- |
| `PROCESS` | Can be assigned by Auto-Assignment Engine; can process payments, mark records complete | Member of FinanceTeam(s); receives auto-assignments; can transition record states |
| `APPROVE` | Can approve financial records as required by ApprovalRoutingRule | Can be assigned as required approver; signs off on records |
| `PROCESS_AND_APPROVE` | Both PROCESS and APPROVE | Combined responsibilities (typical Finance Manager) |
| `NONE` | No finance action authority | Cannot be auto-assigned, cannot be required approver |

Constraints:

- A user with `financeResponsibility = NONE` cannot be a member of any FinanceTeam.
- A user with `financeResponsibility = NONE` cannot be set as a required approver in any ApprovalRoutingRule.
- Membership in FinanceTeam REQUIRES `financeResponsibility ? { PROCESS, PROCESS_AND_APPROVE }`.
- `APPROVE` alone does not imply queue processing rights.


### 2.4 ù billingAccess

Purpose: governs access to subscription, invoices, payment methods, and billing settings.

| Value | Meaning | Allowed Actions |
| --- | --- | --- |
| `MANAGE` | Full billing control | Change plan, update payment method, view invoices, manage subscription |
| `READ` | View billing info but cannot modify | View invoices, view current plan, view usage ù cannot change anything |
| `NONE` | No billing access | Billing pages return 403 |

Constraints:

- Workspace MUST have at least 1 user with `billingAccess = MANAGE` at all times (typically OWNER).
- Demoting the last MANAGE user requires promoting another user first.
- `billingAccess` does NOT auto-derive from workspaceRole (an ADMIN may have NONE; a MEMBER may have MANAGE if explicitly granted).
- Billing access is tenant-local and does not propagate across tenant memberships.


## Section 3 ù TenantMembership Schema Changes

```prisma
enum WorkspaceRole {
  OWNER
  ADMIN
  MEMBER
}

enum FinancialAccessScope {
  ALL
  DEPARTMENT
  OWN_AND_PARTICIPATING
  NONE
}

enum FinanceResponsibility {
  PROCESS
  APPROVE
  PROCESS_AND_APPROVE
  NONE
}

enum BillingAccessLevel {
  MANAGE
  READ
  NONE
}

model TenantMembership {
  // ... existing fields ...
  
  // NEW 4-axis fields
  workspaceRole         WorkspaceRole         @default(MEMBER)
  financialAccess       FinancialAccessScope  @default(OWN_AND_PARTICIPATING)
  financeResponsibility FinanceResponsibility @default(NONE)
  billingAccess         BillingAccessLevel    @default(NONE)
  
  // ... existing relations ...
  
  @@index([tenantId, workspaceRole])
  @@index([tenantId, financeResponsibility])  // for assignment engine
  @@index([tenantId, billingAccess])
}
```

Migration considerations:

- All existing memberships default to:
  - `workspaceRole`: derive from existing `TenantUserRole` (OWNER ? OWNER, ADMIN ? ADMIN, else MEMBER)
  - `financialAccess`: OWN_AND_PARTICIPATING
  - `financeResponsibility`: NONE (admins must explicitly grant later)
  - `billingAccess`: derive ù first OWNER gets MANAGE, others NONE
- Backfill via migration script (Phase B2).
- Existing `TenantUserRole` and `TenantRole` tables are NOT removed ù they continue to support legacy permission-based checks during transition (deprecated in F phase after 4-axis is fully wired).

Recommended rollout mechanics:

- Apply additive schema migration first.
- Run deterministic backfill in small batches if needed.
- Validate invariants (at least one owner, at least one billing manager per tenant).
- Emit audit summary metrics for migration verification.

## Section 4 ù TenantInvitation Schema Changes

```prisma
model TenantInvitation {
  // ... existing fields ...
  
  // NEW: invitation-time 4-axis presets
  workspaceRole         WorkspaceRole         @default(MEMBER)
  financialAccess       FinancialAccessScope  @default(OWN_AND_PARTICIPATING)
  financeResponsibility FinanceResponsibility @default(NONE)
  billingAccess         BillingAccessLevel    @default(NONE)
  
  // ... rest unchanged ...
}
```

When an invitation is accepted, the values copy to the new TenantMembership row.

Implementation notes:

- Copy occurs server-side in invitation acceptance transaction.
- Values must be revalidated at acceptance time in case invitation policy changed.
- Invalid combinations should fail closed with a safe API error.

## Section 5 ù Permission Resolution Algorithm

Canonical pseudocode:

```text
function canUserDo(userId, tenantId, action) {
  membership = getMembership(userId, tenantId)
  if (!membership || membership.status !== 'ACTIVE') return false
  if (user.isPlatformBlocked) return false
  
  switch (action.category) {
    case 'WORKSPACE_ADMIN':
      return checkWorkspaceRole(membership.workspaceRole, action)
    
    case 'FINANCE_VIEW':
      return checkFinancialAccess(membership.financialAccess, action.recordContext)
    
    case 'FINANCE_ACTION':
      return checkFinanceResponsibility(membership.financeResponsibility, action)
    
    case 'BILLING':
      return checkBillingAccess(membership.billingAccess, action)
    
    default:
      // Fall back to legacy permission system during transition
      return hasLegacyPermission(userId, tenantId, action.permissionKey)
  }
}
```

Detailed sub-function logic:

```text
function checkWorkspaceRole(workspaceRole, action) {
  if (workspaceRole === 'OWNER') return true

  if (workspaceRole === 'ADMIN') {
    if (action.type in [
      'MEMBER_INVITE',
      'MEMBER_REMOVE',
      'MEMBER_AXIS_UPDATE',
      'SETTINGS_UPDATE',
      'FINANCE_TEAM_MANAGE',
      'AUDIT_LOG_VIEW'
    ]) return true

    if (action.type in [
      'WORKSPACE_DELETE',
      'OWNERSHIP_TRANSFER'
    ]) return false

    return false
  }

  // MEMBER
  if (action.type in [
    'RECORD_CREATE',
    'PROFILE_VIEW_SELF',
    'WORKFLOW_PARTICIPATE_ASSIGNED'
  ]) return true

  return false
}
```

```text
function checkFinancialAccess(financialAccess, recordContext) {
  if (financialAccess === 'ALL') return true
  if (!recordContext) return false

  if (financialAccess === 'NONE') return false

  if (financialAccess === 'OWN_AND_PARTICIPATING') {
    if (recordContext.createdByUserId === recordContext.requestingUserId) return true
    if (recordContext.participantUserIds contains recordContext.requestingUserId) return true
    return false
  }

  // DEPARTMENT
  if (financialAccess === 'DEPARTMENT') {
    if (recordContext.requestingUserDepartmentIds is empty) return false
    if (!recordContext.recordDepartmentId) return false
    return recordContext.requestingUserDepartmentIds contains recordContext.recordDepartmentId
  }

  return false
}
```

```text
function checkFinanceResponsibility(financeResponsibility, action) {
  if (financeResponsibility === 'NONE') return false

  if (action.type in [
    'RECORD_PROCESS_START',
    'RECORD_PROCESS_COMPLETE',
    'PAYMENT_MARK_SUBMITTED',
    'PAYMENT_MARK_SETTLED',
    'ASSIGNMENT_ACCEPT',
    'ASSIGNMENT_RELEASE'
  ]) {
    return financeResponsibility in ['PROCESS', 'PROCESS_AND_APPROVE']
  }

  if (action.type in [
    'APPROVAL_APPROVE',
    'APPROVAL_REJECT',
    'APPROVAL_REQUEST_CHANGES'
  ]) {
    return financeResponsibility in ['APPROVE', 'PROCESS_AND_APPROVE']
  }

  return false
}
```

```text
function checkBillingAccess(billingAccess, action) {
  if (billingAccess === 'MANAGE') return true

  if (billingAccess === 'READ') {
    return action.type in [
      'BILLING_PLAN_VIEW',
      'BILLING_USAGE_VIEW',
      'BILLING_INVOICE_VIEW'
    ]
  }

  // NONE
  return false
}
```

Algorithm invariants:

- Membership lookup must be tenant-scoped and status-aware.
- Platform-blocked users fail closed regardless of axis values.
- Record-level checks must never trust client-supplied tenant or ownership claims.
- During migration, legacy fallback is transitional and should be removed in Phase F.

## Section 6 ù Forbidden Combinations

| workspaceRole | financialAccess | financeResponsibility | billingAccess | Forbidden? | Reason |
| --- | --- | --- | --- | --- | --- |
| OWNER | NONE | * | * | ? Forbidden | Owners can always see everything (forced ALL) |
| OWNER | * | * | NONE | ? Forbidden | At least 1 owner must have billing MANAGE |
| MEMBER | * | * | MANAGE | ?? Allowed but unusual | Possible if delegated billing only |
| * | NONE | PROCESS | * | ? Forbidden | Can't process records you can't see |
| * | NONE | APPROVE | * | ? Forbidden | Can't approve records you can't see |
| * | NONE | PROCESS_AND_APPROVE | * | ? Forbidden | Same as above |
| * | OWN_AND_PARTICIPATING | PROCESS | * | ?? Allowed but unusual | Process only their own records ù niche use case |

Additional forbidden combinations and practical constraints (to reach full policy set used in implementation):

| workspaceRole | financialAccess | financeResponsibility | billingAccess | Forbidden? | Reason |
| --- | --- | --- | --- | --- | --- |
| OWNER | DEPARTMENT | * | * | ? Forbidden | OWNER visibility is always ALL |
| OWNER | OWN_AND_PARTICIPATING | * | * | ? Forbidden | OWNER visibility is always ALL |
| * | DEPARTMENT | * | * | ?? Conditionally blocked | If user has zero department assignments |

Validation enforcement points:

1. API endpoint that creates/updates membership: Zod schema validation.
2. API endpoint that creates invitation: same Zod validation.
3. DB level: Prisma `@@check` if available (Prisma 6 supports check constraints), otherwise enforced at app layer.

Recommended validation helper behavior:

- Normalize incoming partial payload with current stored values before validation.
- Validate cross-field consistency in one pass.
- Return deterministic error codes/messages for UI mapping.
- Log rejected combinations for operational visibility.

## Section 7 ù Migration Path from Current RBAC

1. **Add new fields** with sensible defaults (Phase B2 migration).
2. **Backfill script** runs once in production:
   - Map existing `TenantUserRole` ? `workspaceRole` (OWNER, ADMIN remain; everything else ? MEMBER)
   - Set `financialAccess = OWN_AND_PARTICIPATING` for all (admins explicitly upgrade later)
   - Set `financeResponsibility = NONE` for all (admins explicitly grant)
   - For each tenant, find the FIRST user with `TenantUserRole = OWNER` ? set `billingAccess = MANAGE`; rest get NONE
3. **Update server-side authorization helpers** to check both new axes AND legacy permissions during transition (Phase B3).
4. **UI updates** to display and allow editing 4-axis (Phase E).
5. **Deprecation notice** for legacy permissions (Phase F).
6. **Remove legacy permission checks** (Phase F final cleanup).

Execution safeguards:

- Run backfill in idempotent mode with resume capability.
- Write migration audit summary per tenant (owners count, manage count).
- Abort tenant batch if invariants fail; continue with explicit operator review queue.
- Validate on empty DB and non-empty seeded-like datasets.

## Section 8 ù API Contract

The 4-axis values are exposed via:

### GET `/api/settings/workspace/members/[membershipId]`

Returns full membership including 4 axes.

Expected response shape (conceptual):

- identity and membership metadata
- all four axis values
- editability flags (derived from caller authorization)

### PATCH `/api/settings/workspace/members/[membershipId]`

Updates 4 axes (partial allowed). Validates against forbidden combinations.

Request body Zod schema:

```ts
const updateMembershipSchema = z.object({
  workspaceRole: z.nativeEnum(WorkspaceRole).optional(),
  financialAccess: z.nativeEnum(FinancialAccessScope).optional(),
  financeResponsibility: z.nativeEnum(FinanceResponsibility).optional(),
  billingAccess: z.nativeEnum(BillingAccessLevel).optional(),
}).refine(
  (data) => /* check forbidden combinations using helper */,
  { message: "This combination of access levels is not allowed" }
);
```

Audit log action:

- `tenant.member.access_changed`
- metadata payload: `{ changedAxes: { ... }, previousValues: { ... }, newValues: { ... } }`

Contract rules:

- Caller cannot self-modify axis values.
- Caller must be OWNER/ADMIN with proper authority.
- Responses should conceal unauthorized target membership existence where policy requires.
- API performs server-side tenant resolution; no trust in client tenant identifiers.

Error semantics:

- `400` invalid payload shape
- `403` authenticated but insufficient authority
- `404` membership concealed or not found in tenant scope
- `409` invariant conflict (last owner, last billing manager)

## Section 9 ù Example Real-World Configurations

```text
Sarah (CEO):
  workspaceRole: OWNER
  financialAccess: ALL
  financeResponsibility: APPROVE
  billingAccess: MANAGE

Marcus (Finance Manager):
  workspaceRole: ADMIN
  financialAccess: ALL
  financeResponsibility: PROCESS_AND_APPROVE
  billingAccess: READ

Laura (AP Specialist, Accounting Department):
  workspaceRole: MEMBER
  financialAccess: DEPARTMENT
  financeResponsibility: PROCESS
  billingAccess: NONE

Diego (Engineering Manager):
  workspaceRole: MEMBER
  financialAccess: DEPARTMENT
  financeResponsibility: APPROVE
  billingAccess: NONE

Patricia (HR, no finance involvement):
  workspaceRole: ADMIN
  financialAccess: NONE
  financeResponsibility: NONE
  billingAccess: NONE
```


## Section 10 ù Edge Cases

1. **Last OWNER promotion required before demotion**
   - cannot demote the last OWNER without first promoting another user
   - enforced in update membership API transaction

2. **Last MANAGE billing**
   - cannot revoke MANAGE from the last user with it without granting MANAGE to someone else first
   - conflict response should clearly identify invariant

3. **financialAccess = DEPARTMENT but no department assigned**
   - user sees nothing
   - UI must surface this explicitly to avoid confusion

4. **financeResponsibility change while user has open assignments**
   - existing assignments NOT auto-revoked
   - reconciler in Phase D may detect and alert

5. **financialAccess = NONE blocks list endpoints**
   - records list returns empty
   - UI must distinguish "no access" from "no records"

6. **Cross-tenant 4-axis isolation**
   - a user belonging to tenant A and tenant B has independent 4-axis values per tenant
   - values are stored on TenantMembership, never on global User

7. **Platform admin override**
   - a Platform Admin (vendor role) can VIEW any tenant data for support but cannot modify without explicit elevation
   - override path must be audited and time-bounded where applicable

8. **Invitation acceptance with mismatched email**
   - invitation 4-axis values copy to new membership regardless of email matching strategy
   - invitation policy still controls acceptance identity

9. **Plan downgrade affecting access**
   - if a tenant downgrades from Enterprise (which allows certain financialAccess scopes), existing members keep their access but new memberships may be restricted
   - policy messaging shown in settings UI and API warnings

10. **Self-modification prohibition**
    - a user CANNOT modify their own 4-axis values (must be done by another ADMIN/OWNER)
    - prevents privilege escalation and accidental lockout loops


## Section 11 ù Definition of Done for Access Model Implementation

The 4-axis access model is considered fully implemented when:

- 4 enum values exist in schema (B Phase)
- TenantMembership and TenantInvitation have new fields (B Phase)
- Backfill migration runs successfully on empty DB AND has tested logic for non-empty DB (B Phase)
- Server-side helper `hasAccess({ userId, tenantId, action })` exists and uses 4-axis (C Phase)
- All 5 example configurations in Section 9 are valid in the system (C Phase test cases)
- All 10 forbidden combinations in Section 6 are rejected at API layer (C Phase test cases)
- All 10 edge cases in Section 10 have explicit handling code (C Phase)
- UI for managing 4-axis exists in workspace settings (E Phase)
- Invitation flow exposes 4-axis preset (E Phase)
- Integration test coverage for cross-tenant 4-axis isolation (Phase B includes 1 integration test)
- Audit log action `tenant.member.access_changed` is fired correctly (B/C Phase)


## Section 12 ù Changelog

```markdown
| Version | Date | Change |
|---|---|---|
| 1.0 | 2026-04-29 | Initial spec ù 4 axes, schema design, migration path, API contract, edge cases |
```
