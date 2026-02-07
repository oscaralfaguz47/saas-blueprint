# C2 — Request List Tabs

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

Provide structured request list tabs in the main list view:

Tabs:

- Inbox  
  - Pending my approval  
  - Mentioned  
- My Requests  
- Shared with me  
- Finance Views (Finance/Admin only)

Each tab must:

- Have its own query and filters
- Support basic sorting
- Be performant (indexed queries)
- Highlight requests with:
  - Critical comments
  - Unread mentions


---

# Definition of Done


## General Requirements

- Each tab has a dedicated backend query
- All queries enforce access rules (C1)
- Sorting supported:
  - Default sorting defined per tab
- Queries use proper DB indexes
- Requests with critical comments appear with visual badge
- Requests with unread mentions appear highlighted


---

## Tab Definitions


### 1. Inbox

Shows:

- Requests where:
  - user is internal participant
  - AND participant.status = PENDING

Includes:

- Mentions view (can be separate sub-tab or filter)

Sorting:

1. Critical first (has unread critical comment)
2. Then by createdAt DESC


Query logic (conceptual):

- JOIN RequestParticipant
- WHERE participant.userId = currentUserId
- AND participant.status = PENDING
- AND access rules apply


---

### 2. Mentioned

Shows:

- Requests where:
  - user has unread RequestCommentMention

Sorting:

- createdAt DESC (of mention)
- Critical mentions first

Query logic:

- JOIN RequestCommentMention
- WHERE mentionedUserId = currentUserId
- AND isRead = false


---

### 3. My Requests

Shows:

- Requests where:
  - createdByUserId = currentUserId

Sorting:

- createdAt DESC


---

### 4. Shared With Me

Shows:

- Requests where:
  - user has RequestAccess
  - AND NOT creator
  - AND NOT pending approver (optional filter)

Sorting:

- createdAt DESC


---

### 5. Finance Views

Visible only if user has:

- `tenant.requests.read_all`
OR
- `tenant.billing.manage`
OR
- Finance/Admin role

Possible sub-views:

- All requests
- Paid missing proof (H2)
- Payment status filters

Finance tab visibility must be enforced server-side.


---

## Visual Badges


### Critical Badge

Displayed if:

- Exists unread RequestComment where isCritical = true

Logic:

- LEFT JOIN or precomputed boolean
- UI shows:
  - “Action required” badge


### Unread Mention Highlight

Displayed if:

- Exists RequestCommentMention
- mentionedUserId = currentUserId
- isRead = false

UI:

- Highlight row
- Mention indicator icon


---

## Performance Requirements

- All queries must use indexed columns
- Recommended indexes:

Request:

- (tenantId, createdAt DESC)
- (tenantId, createdByUserId)

RequestParticipant:

- (tenantId, userId, status)

RequestAccess:

- (tenantId, userId)

RequestCommentMention:

- (tenantId, mentionedUserId, isRead)

RequestComment:

- (tenantId, requestId, isCritical)


- Avoid N+1 queries
- Use pagination (limit + offset or cursor-based)


---

# Acceptance Criteria

- Inbox (Pending):
  - Shows only requests where user is internal participant with status = PENDING
  - Sorted: critical first, then newest

- Mentioned:
  - Shows only requests with unread mentions
  - Disappears when mention marked as read

- Finance tabs:
  - Visible only if user has required permission
  - Hidden otherwise (server + UI)

- Request with recent rejection appears on top (critical = true)
- Request with unread mention appears visually highlighted


---

# Edge Cases

- User is creator + approver:
  - Appears in Inbox (if pending)
  - Appears in My Requests
- User loses access after mention:
  - Mention should not grant visibility unless auto-share (F3)
- Massive dataset:
  - Pagination required
- Simultaneous updates:
  - Queries reflect real-time state


---

# Sorting Rules Summary

Inbox:

1. hasUnreadCriticalComment DESC
2. createdAt DESC

Mentioned:

1. mentionCreatedAt DESC

My Requests:

1. createdAt DESC

Shared:

1. createdAt DESC


---

# Security Rules

- All queries must enforce tenantId
- Access logic must not rely only on frontend
- Finance views must be validated server-side
- No cross-tenant data leakage


---

# Best Practices

- Precompute lightweight flags if necessary (e.g., hasUnreadMention)
- Avoid heavy joins in large datasets (use indexed flags)
- Use cursor pagination for scalability
- Keep query logic centralized in repository layer
- Ensure consistency with C1 access function


---

# Future Enhancements (Not v1)

- Saved filters
- Advanced search per tab
- Bulk actions
- Custom tab ordering
- User-specific tab configuration
- SLA aging indicators
- Real-time updates via WebSocket
