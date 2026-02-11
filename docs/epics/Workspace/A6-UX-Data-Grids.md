# A6-UX-Data-Grids

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

> Applies to: `app/settings/workspace` (General / Members / Invites)

---

## 🎯 Epic Objective

Upgrade `app/settings/workspace` to a **consistent, mobile-first, high-performance** experience by:

- making Members/Invites tables fully manageable on mobile
- standardizing UI with **Shadcn** components (Tabs, Table, Inputs, Textarea, Combobox, Hover Card, Skeleton)
- implementing **server-side sorting, filtering, and cursor-based infinite scroll** (efficient data access)
- ensuring filters apply in real time (no “Search” button)
- improving feedback patterns (save success check icon, reduce unnecessary toasts)
- removing spinners and using **Skeleton Loaders** for a modern “fast” feel

---

## 📦 Scope

### ✅ Included

#### UI Consistency (Shadcn)
- Replace custom UI elements in `app/settings/workspace` with Shadcn:
  - Tabs: `Tabs`
  - Inputs: `Input`
  - Textareas: `Textarea`
  - Timezone/Currency/Date format selects: `Combobox` (keep existing option sets)
- Implement Shadcn **Hover Card** (preferred) or Tooltip:
  - Add a question icon next to **Role** select in Members
  - Explain each role: OWNER / ADMIN / FINANCE / MEMBER

#### Tables (Shadcn + Responsive + Functional)
- Replace Members/Invites tables with Shadcn table pattern:
  - Sorting (server-side) by:
    - Members: User, Role, Status, Joined
    - Invites: Email, Status (and optional: InvitedAt / ExpiresAt if already present)
  - **Virtualized infinite scroll**:
    - Fetch first 10 results
    - Fetch next pages in increments of 10 when user scrolls down
    - Use virtualization to render only visible rows for performance

#### Filters (Real-Time)
- Members filters:
  - search input: name/email
  - role filter (multi-select checkbox dropdown)
  - status filter (multi-select checkbox dropdown)
- Invites filters:
  - search input: email
  - status filter (multi-select checkbox dropdown)
- Real-time behavior rules:
  - Dropdown filter changes apply immediately (no Apply button)
  - Search input triggers request:
    - on **Enter**
    - or on **Blur** (click out)
  - Infinite scroll must reset correctly on any filter/sort change

#### Performance / Data Access (Critical)
- Data fetching must be **server-side cursor pagination**:
  - only fetch 10 records per request (or configured page chunk size)
  - return a `nextCursor` when more results exist
- Avoid N+1 queries
- Return only needed columns (use `select`, avoid heavy `include`)
- Sorting must be stable and compatible with cursor pagination

#### Feedback / Loading / Toast Policy
- Replace spinners with Skeleton Loaders on all pages in this scope where requests execute
- Save button feedback (General tab):
  - show check icon when save completes
  - hide it a few seconds later
- Toast policy:
  - show toast only when no inline UI message exists
  - example: Invite modal “User is already a member of this tenant” should be **inline only**, not toast

---

### ❌ Explicitly NOT Included

- Changing business rules for memberships/invites (A3 governs)
- Adding new roles or permissions
- Bulk operations (bulk invite, bulk disable)
- Export features (CSV/PDF)
- Server-side full-text search engines (use indexed lookups only)

---

## 🧭 UX / IA Requirements

### Workspace Settings Page
Location:
- `app/settings/workspace`

Shadcn Tabs:
- `General`
- `Members`
- `Invites`
- `Billing` (existing link/route allowed)

Mobile requirements:
- Tabs must be usable on small screens (scrollable tab list if needed)
- Tables must remain usable without pinch-zoom
- Table actions must remain tappable (min touch target ~44px)

---

## 🧩 Members Tab Requirements

### Table Columns (UI)
- User (name + email)
- Role
- Status
- Joined
- Actions (if already present; not expanded in this epic)

### Sorting (Server-side)
- User (by name, then email)
- Role
- Status
- JoinedAt

### Infinite Scroll + Virtualization
- Initial fetch: 10 items
- When user scrolls near bottom:
  - fetch next 10 using `nextCursor`
- Use virtualization:
  - only render visible rows
  - keep scrolling smooth on large lists (1000+)

### Filters
- Search input:
  - placeholder: “Search by name or email”
  - triggers request on Enter or Blur
- Role multi-filter:
  - checkbox dropdown: OWNER / ADMIN / FINANCE / MEMBER
- Status multi-filter:
  - checkbox dropdown: ACTIVE / DISABLED (and any other statuses you store)

### Role Help (Hover Card)
- Icon: question icon next to Role header and/or role filter label (choose best UX)
- Hover Card content (short + clear):
  - OWNER: Full control, billing, roles, workspace settings
  - ADMIN: Manage workspace operations and members (except billing if restricted)
  - FINANCE: Access finance-related workflows/approvals (as defined by RBAC)
  - MEMBER: Standard access, limited management rights

---

## ✉️ Invites Tab Requirements

### Table Columns (UI)
- Email
- Status
- InvitedAt (optional if already present)
- ExpiresAt (optional if already present)
- Actions (resend/revoke/re-invite if already present)

### Sorting (Server-side)
- Email
- Status
- (Optional) InvitedAt
- (Optional) ExpiresAt

### Infinite Scroll + Virtualization
- Initial fetch: 10 items
- Fetch next 10 on scroll using `nextCursor`
- Virtualize rows for performance

### Filters
- Search input:
  - placeholder: “Search by email”
  - triggers request on Enter or Blur
- Status multi-filter:
  - checkbox dropdown: ACTIVE / EXPIRED / REVOKED / ACCEPTED (align to your status logic)

---

## ⚙️ General Tab Requirements

### Shadcn Components
- Convert all existing inputs/textareas to:
  - `Input`
  - `Textarea`
- Replace Timezone/Currency/Date format selects with Shadcn `Combobox`
  - Keep existing option sets unchanged
  - Must be keyboard accessible
  - Should support search/type-ahead for large timezone lists

### Save Button Success Feedback
- On successful save:
  - show check icon inside button
  - hide after a few seconds
- Do not rely solely on toast for success; button feedback is primary
- Errors:
  - display inline field errors when possible
  - use toast only for non-field/global errors (see Toast Policy)

---

## 🧊 Loading State Requirements (Skeletons Only)

- Remove spinners from:
  - Members tab data fetch
  - Invites tab data fetch
  - General tab initial load + save
  - Invite modal actions (create/resend/revoke) where applicable
- Use Shadcn Skeleton patterns:
  - Table skeleton: header + ~6 row placeholders
  - Form skeleton: input line placeholders
- Loading must preserve layout to reduce UI shift

---

## 🔔 Toast Policy (Strict)

### Allowed toast usage
- Global failures where no inline container exists
  - network error
  - server error
  - permission error that is not tied to a specific field

### Disallowed toast usage
- When an inline validation/error is shown in the same UI surface
  - Example: Invite modal “User is already a member of this tenant” must be inline only

---

## 🧠 Data Fetching Contract (Cursor-based Infinite Scroll)

### Requirements
- Members and Invites must use **cursor pagination** and return:
  - `items` for the current chunk (10)
  - `nextCursor` if more results exist, otherwise `null`
- The DB query must return only requested columns
- All filters and sorting must be applied server-side
- Cursor must be compatible with the chosen sort (stable ordering required)

### Standard Query Inputs
For each table request, pass:
- `limit` (fixed 10 in this epic)
- `cursor` (opaque string; null for first page)
- `sortBy`
- `sortDir` (`asc|desc`)
- `search` (string, optional)
- `filters` (arrays, optional)

---

## 🔌 API Endpoints (Proposed)

> Adjust route handler locations per your architecture rules (App Router route handlers).  
> Tenant resolution must be server-side (never trust client tenantId).

### 1) Members List (Cursor)
`GET /api/settings/workspace/members`

Query params:
- `limit` (fixed 10; server enforces)
- `cursor` (optional)
- `sortBy` (`user|role|status|joined`)
- `sortDir` (`asc|desc`)
- `search` (optional)
- `roles` (optional, comma-separated)
- `statuses` (optional, comma-separated)

Response:
```json
{
  "items": [
    {
      "userId": "…",
      "name": "…",
      "email": "…",
      "role": "OWNER|ADMIN|FINANCE|MEMBER",
      "status": "ACTIVE|DISABLED",
      "joinedAt": "2026-02-10T00:00:00.000Z"
    }
  ],
  "nextCursor": "opaque-string-or-null"
}
