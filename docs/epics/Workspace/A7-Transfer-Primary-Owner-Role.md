# A2-G1 — Transfer Primary Ownership (Governance Operation)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.
> Depends on: **A2 — Roles and Permissions (RBAC)**

---

## 🎯 Epic Objective

Implement a **secure, atomic, governance-hardened transfer of Primary Ownership** within a workspace (tenant), ensuring:

- Exactly **one Primary Owner** exists at all times
- At least **one active Owner-level user** exists at all times
- No privilege escalation is possible
- Transfer is explicit, intentional, and auditable
- Operation is protected against race conditions, replay, and cross-tenant abuse
- UI clearly communicates governance impact

---

## 🧠 Governance Context (from A2)

Hierarchy:

Primary Owner (5) > Owner (4) > Admin (3) > Finance (2) > Member (1)

Workspace Safety Constraints:

1. Exactly one Primary Owner must exist at all times
2. At least one Owner-level user must exist at all times to implement this feature.
3. No action can leave workspace without an active Primary Owner
4. No action can leave workspace with zero active Owner-level users

Transfer Primary Ownership is a **special governance operation** and cannot be performed via generic role update endpoints.

---

## 👑 Operation Definition

Transfer Primary Ownership:

- Current Primary Owner → becomes `Owner`
- Target member → becomes `Primary Owner`
- No other permissions change
- Exactly one Primary Owner remains after commit

---

## 🔐 Authorization Rules

### Actor Requirements

- Authenticated
- ACTIVE membership in workspace
- Role = `Primary Owner`
- Must pass step-up authentication check

No other role may initiate transfer.

---

### Target Requirements

- ACTIVE membership
- Same tenant
- Not DISABLED
- Not pending invite
- Not current Primary Owner
- Only users with role `Owner` or `Admin` can be targeted

---

## 🔒 Security Hardening

### 1️⃣ Step-Up Authentication (Mandatory)

Transfer requires:

- Recent authentication window (e.g. ≤10 minutes), OR
- Explicit re-authentication challenge

Without this → reject request.

---

### 2️⃣ Dedicated Endpoint Only

Transfer can only be executed through:

POST `/api/workspaces/:slug/ownership/transfer`

Generic role update endpoints must:

- Explicitly reject assignment of `Primary Owner`
- Reject demotion of current Primary Owner
- Reject self-demotion of Primary Owner

---

### 3️⃣ Atomic Transaction (Mandatory)

Inside single transaction:

1. Lock tenant row OR current Primary Owner membership row
2. Re-fetch actor membership
3. Re-validate actor role still `Primary Owner`
4. Re-validate target membership ACTIVE + same tenant
5. Apply updates:
   - Old Primary Owner → role = Owner
   - Target → role = Primary Owner
6. Validate invariants:
   - Exactly 1 Primary Owner
   - ≥1 Owner-level ACTIVE user
7. Insert AuditLog entry
8. Commit

If any validation fails → rollback.

---

### 4️⃣ Race Condition Protection

- Use row-level locking
- Use appropriate isolation level
- Never trust pre-transaction checks

---

### 5️⃣ Replay & Idempotency Protection

- Support idempotency key header OR
- If target already Primary Owner → return success without mutation
- Prevent double role flipping on retries

---

### 6️⃣ Cross-Tenant Protection

All DB queries must include tenantId.

Never trust client-provided membership IDs without tenant scoping.

---

### 7️⃣ Rate Limiting

Example:

- Max 3 transfers per hour per tenant

---

### 8️⃣ Owner-Level Collapse Protection

Operation must ensure:

- Cannot disable last Owner-level user
- Cannot disable Primary Owner
- Cannot result in zero Owner-level ACTIVE users

---

### 9️⃣ Optional Governance Notification

After successful transfer:

- Notify previous Primary Owner
- Notify new Primary Owner
- Notify all Owner-level users

---

## 🎨 UI / UX Specification

### Location

Settings → Workspace → Members

---

### Visibility

- Only visible to Primary Owner
- Hidden from all other roles

---

### Modal Flow

#### Step 1 — Select Target

- Explain consequences
- Display current Primary Owner
- Searchable list of eligible ACTIVE members (Owners or Admins), sorted by name (excluding self)

Primary button: Continue

---

#### Step 2 — Confirm

Display:

- Old Primary Owner
- New Primary Owner
- Governance impact message: "You are about to transfer the Primary Owner role to [newPrimaryOwnerName]. This action is irreversible and will remove you from the Primary Owner role. Are you sure you want to continue?"

Require:

- Type workspace slug to confirm

Primary button:
Transfer Ownership (destructive styling)

---

### Success Behavior

- Update badges immediately
- Show success toast

---

### Error Messages

Generic, safe messages:

- "Target user is no longer active."
- "Primary Owner has changed during this operation."
- "Transfer could not be completed."

No internal DB details exposed.

---

## 🧾 Audit Logging

Action key:

tenant.membership.primary_owner_transferred

Must include:

- actorId
- oldPrimaryOwnerId
- newPrimaryOwnerId
- tenantId
- before/after role values
- timestamp

Audit logs must be immutable.

---

## ⚙️ Performance & Indexing

Required indexes:

- (tenantId, role)
- (tenantId, status)
- membershipId (PK)
- Optional: partial unique index enforcing single Primary Owner

Lock only required rows.

Return minimal projection to client.

---

## 🔐 Enforcement Rules

- Server-side enforcement only
- UI visibility ≠ authorization
- Role change endpoint cannot simulate transfer
- Invariants validated inside transaction
- Never trust client-provided role assignments

---

## 🧪 Definition of Done

- Dedicated endpoint implemented
- Step-up authentication enforced
- Transaction-level invariant enforcement
- Replay protection implemented
- Rate limiting implemented
- Role update endpoint hardened
- Audit logging implemented
- UI confirmation flow implemented
- All race-condition tests pass
- No scenario allows:
  - Multiple Primary Owners
  - Zero Primary Owners
  - Zero Owner-level users

---

## 🧪 Acceptance Criteria

- Only Primary Owner can initiate transfer
- Owner/Admin/Finance/Member cannot initiate
- Transfer cannot occur without step-up authentication
- Transfer cannot be replayed to corrupt state
- Concurrent transfers cannot break invariants
- Generic role endpoint cannot assign Primary Owner
- Workspace never ends up with:
  - Multiple Primary Owners
  - No Primary Owner
  - No Owner-level user
