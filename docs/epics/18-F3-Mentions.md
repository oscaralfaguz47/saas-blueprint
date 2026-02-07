# F3 — Mentions (@username)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

- Detect `@username` inside comments
- Create mention records per tagged user
- Provide a “Mentioned” inbox
- Allow marking mentions as read
- If tagging a user without access:
  - Automatically grant Viewer access (no escalation)
- Detect mentions inside comments
- Identify “critical” comments (rejections, info requests)
- Display visual badge when action is required


---

# Definition of Done


## Core Behavior

When a comment is created:

1. Parse content for `@username` patterns
2. Map each mention to a tenant user
3. Create `RequestCommentMention` rows per user
4. Emit RequestEvent:
   - `request.user.mentioned`
5. Insert RequestAccess if user does not already have access:
   - accessType = VIEW
   - reason = MentionAutoShare
6. Emit RequestEvent:
   - `request.shared` (reason: MentionAutoShare)
7. Mention appears in “Mentioned” inbox
8. Mention is unread by default
9. User can mark mention as read via endpoint


---

## Parser Rules

- Use stable regex (example pattern):
  - `@([a-zA-Z0-9._-]+)`
- Mentions must:
  - Match existing username within tenant
- Case-insensitive match recommended
- Invalid usernames:
  - Do NOT break comment creation
  - Simply ignore invalid mention

Parser must:

- Not trigger on email addresses
- Avoid false positives inside URLs


---

## Data Model (Minimum)

### RequestCommentMention

- id
- tenantId
- requestId
- commentId
- mentionedUserId
- createdAt
- isRead (default false)
- readAt (nullable)

Constraints:

- UNIQUE (commentId, mentionedUserId)
- Index: (tenantId, mentionedUserId, isRead)


---

## Access Auto-Share Rules

If mentioned user does NOT have request access:

- Insert into RequestAccess:
  - requestId
  - userId
  - accessType = VIEW
  - grantedBySystem = true
  - reason = MentionAutoShare

Important:

- Must NOT grant EDIT or approval rights
- Must NOT escalate permissions
- Must remain VIEW-only


---

## Mentioned Inbox

Query:

- tenantId = current tenant
- mentionedUserId = current user
- isRead = false

Sorted by:

- createdAt DESC

User sees:

- request reference
- comment snippet
- timestamp


---

## Mark as Read Endpoint

Endpoint:

- markMentionAsRead(mentionId)

Rules:

- Only mentioned user can mark as read
- Update:
  - isRead = true
  - readAt = UTC
- Default behavior:
  - mention disappears from unread view


---

## Critical Comments Detection

A comment is marked as critical (`isCritical = true`) if:

- It is a rejection (F2)
OR
- It contains request for information (future NLP or rule-based detection)

Rules:

- Add boolean field to RequestComment:
  - isCritical (default false)
- Rejection comments automatically set:
  - isCritical = true


---

## UI Behavior

- Comments marked as critical appear in highlighted section
- Badge “Action required” visible if:
  - There exists unread critical comment
- Badge disappears once:
  - Mention marked as read
  - OR comment read logic implemented (future)


---

## Request Events

Emit:

- `request.user.mentioned`
- `request.shared` (reason: MentionAutoShare)

Metadata example:

- requestId
- commentId
- mentionedUserId
- autoAccessGranted (true/false)


---

# Acceptance Criteria

- If user comments:
  - "@oscar please review"
  - Oscar sees 1 item in Mentioned inbox

- When Oscar marks it as read:
  - Item disappears from unread list

- Mention does not break if username does not exist
- If user without access is tagged:
  - Viewer access automatically granted
  - User can immediately open request
  - Share event appears in timeline

- Critical comments:
  - Marked with isCritical = true
  - Displayed prominently in request view
  - Badge “Action required” visible if unread


---

# Edge Cases

- Duplicate mentions of same user in one comment:
  - Only one mention record created
- User removed from tenant:
  - Mention remains historical
- Username changed:
  - Mention linked via userId (not string)
- Simultaneous mentions:
  - All processed independently
- Very large comment:
  - Mentions still parsed safely


---

# Concurrency Safety

- Mention creation must be inside same transaction as comment creation
- Auto-share must be idempotent:
  - Check if RequestAccess exists before insert
- Use unique constraints to avoid duplicate rows


---

# Security Rules

- Mentions cannot bypass tenant boundary
- Mention auto-share must not escalate permissions
- Always validate tenantId when resolving usernames
- Do not allow external users to mention internal users (unless explicitly allowed)


---

# Best Practices

- Resolve mentions using userId, not username string
- Snapshot display name for timeline clarity
- Keep mention processing deterministic
- Keep regex minimal and stable
- Avoid heavy NLP in v1


---

# Future Enhancements (Not v1)

- @group mentions
- Mention notifications via email
- Smart detection of critical phrases (NLP)
- Bulk mark-as-read
- Mentions analytics
- Slack-style autocomplete
