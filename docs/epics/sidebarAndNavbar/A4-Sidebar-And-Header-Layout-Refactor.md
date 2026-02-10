# A4 — Sidebar & Header Layout Refactor

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

---

# 🎯 Epic Objective

Refactor the application layout by:

- Removing Dashboard entirely
- Making **Requests** the default landing page
- Implementing a structured Sidebar using Shadcn
- Refactoring the existing Navbar header to align with the Sidebar
- Separating Product Navigation from Workspace & Account context
- Eliminating redundant User Menu workspace items
- Ensuring consistent workspace context visibility

The application must feel:

- Action-first
- Clean
- Hierarchically correct
- PLG-ready

---

# 📦 Scope

## ✅ Included

- Full Sidebar implementation (Shadcn-based)
- Removal of Dashboard page and all related navigation
- Rename "Records" to "Requests"
- Make Requests the application Home
- Logo click redirects to Requests
- Structured Workspace section inside Sidebar
- Remove workspace-related items from User Menu
- Header refactor:
  - Notifications icon
  - User Menu positioned correctly
  - Workspace label visible in header
- Ensure correct navigation behavior
- Ensure no broken routes remain
- Proper active-state handling

---

## ❌ Explicitly NOT Included

- Analytics / Reporting
- New notification system logic
- Role changes
- Workspace creation logic changes (A1)
- Billing logic changes (J1)

---

# 🧭 Global Navigation Philosophy

Navigation must follow this hierarchy:

1. Product Actions (top priority)
2. Workspace Context
3. Account Context

Product navigation must NOT be mixed with Account controls.

---

# 🗂 Sidebar Structure

## 🔝 Top Section

### 1. Application Logo + Name (ATL)

- Positioned at the very top
- Clicking redirects to:
  ```
  /requests
  ```
- This replaces Dashboard as Home

---

### 2. Primary Navigation

- **Requests**
  - Must be visually highlighted as main section
  - Default selected on login
  - Replaces existing "Records"
  - Route: `/requests`

No other primary navigation items required in this epic.

---

## 🏢 Workspace Section

Separator line required before this section.

Label:

```
WORKSPACE
```

---

### Workspace List

Display:

- All workspaces user belongs to
- Current workspace marked as `Current`
- Other workspaces show `Switch to`
- Behavior identical to current User Menu workspace selector

Remove this logic from User Menu.

---

### Create Workspace

Button:

```
+ Create workspace
```

Same behavior as current implementation.

Must open A1 modal flow.

---

### Workspace Settings

Route:
```
/settings/workspace
```

Must reuse existing page.

Remove this option from User Menu.

---

### Billing

Route:
```
/settings/billing
```

Reuse existing page.

Remove this option from User Menu.

---

# 🧠 Header Refactor

The existing Navbar must be adjusted (not rebuilt).

---

## Left Side of Header

Display:

- Workspace Icon
  - If workspace has logo → show it
  - If no logo → show first two letters of workspace name in uppercase
- Workspace Name (text label)

This ensures clear tenant context visibility.

---

## Right Side of Header

Order from left to right:

1. Notifications icon (future logic allowed)
2. User Menu (unchanged behavior)

User Menu must contain ONLY:

- Account Settings
- Sign Out

Remove:

- Workspace list
- Workspace settings
- Billing

These now belong exclusively in Sidebar.

---

# 🏠 Requests as Default Landing Page

## Required Changes

- Remove Dashboard page completely
- Remove all Dashboard routes
- Remove Dashboard from Navbar
- Remove "Records" naming everywhere
- Replace all references with "Requests"
- After login redirect to:
  ```
  /requests
  ```

---

## Logo Behavior

Clicking ATL logo must:

```
router.push("/requests")
```

Never redirect to Dashboard.

---

# 🗑 Removed Elements

The following must be fully removed:

- Dashboard page
- Dashboard navigation entry
- Records naming
- Workspace section from User Menu
- Billing from User Menu
- Workspace Settings from User Menu

No dead routes allowed.

---

# 🧩 Active State Rules

- Sidebar must reflect active route
- Requests highlighted when on:
  ```
  /requests
  /requests/[id]
  ```
- Workspace Settings highlighted on:
  ```
  /settings/workspace
  ```
- Billing highlighted on:
  ```
  /settings/billing
  ```

---

# 📱 Responsive Rules

## Desktop

- Sidebar visible
- Header visible
- Clean layout separation

## Mobile

- Sidebar collapsible
- Header remains visible
- Workspace name still visible
- User Menu functional

---

# 🧾 Data Requirements

No schema changes required.

Must rely on existing:

- TenantMembership
- Default tenant resolution
- Workspace switching logic

---

# 🔐 Security & RBAC

All navigation must respect:

- Active workspace context
- Membership validation
- Platform block rules

Unauthorized access must return:

- 401 if unauthenticated
- 403 if forbidden

---

# ⚠️ Edge Cases

## No Workspace

If user has no workspace:

- Redirect to workspace creation flow (A1)

---

## Workspace Switch

Switching workspace must:

- Update active tenant context
- Persist default if applicable
- Refresh data cleanly

No full reload required.

---

# 📊 Performance Expectations

- No duplicate workspace fetches
- No unnecessary layout re-renders
- No hydration mismatch issues

Sidebar must not cause layout flicker.

---

# 🧪 Definition of Done (DoD)

This epic is complete only if:

- Dashboard no longer exists
- Requests is Home
- Logo redirects correctly
- Records renamed everywhere
- Sidebar implemented
- Workspace list moved to Sidebar
- Workspace settings removed from User Menu
- Billing removed from User Menu
- Header shows workspace label
- Notifications icon visible
- Active states work
- No broken routes
- No console errors
- No duplicate navigation logic

---

# 📣 Events

No new audit events required in this epic.

---

# 🛠 Implementation Notes

- Reuse existing components where possible
- Do not duplicate workspace logic
- Remove dead code related to Dashboard
- Maintain consistent styling with Shadcn
- Ensure layout does not regress in A1 modal behavior
- Keep architecture clean for future Analytics page
