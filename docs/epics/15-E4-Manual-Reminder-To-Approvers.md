# E4 — Manual Reminder to Approvers

## Scope

- Allow sending manual reminders to pending approvers
- No hard 24-hour limitation
- Apply a **soft** rate limit per request (to prevent spam/abuse)


---

# Definition of Done


## Button Visibility (UI Rule)

A “Send reminder” button is visible ONLY if:

- request.status = OPEN
AND
- there is at least one pending approver

Pending approver definition:

- participantRole = APPROVER
- status = PENDING
- participantType = INTERNAL or EXTERNAL


---

## Authorization Rules

To send reminders, acting user must:

1. Have access to the request (C1)
AND
2. Be either:
   - Request creator
   - Finance/Admin
   - Or have permission `tenant.approvals.remind` (recommended)

If not authorized:

- return 403 (or 404 if request not visible)


---

## Reminder Behavior

When sending a reminder:

- System sends email reminders to **only** pending approvers
- Must NOT email approvers who already responded (APPROVED/REJECTED)
- Each email includes:
  - Request summary
  - Link to internal approval page (for internal)
  - Token link (for external) if still valid
- A RequestEvent is created:
  - `request.reminder.sent`
- AuditLog entry is created (recommended, aligned with K1):
  - `request.reminder.sent`


---

## Rate Limiting (Soft)

No strict 24h limit, but enforce soft throttling:

- Per request:
  - allow 1 reminder per X minutes (configurable)
  - recommended default: 10 minutes

If user tries too soon:

- Block sending
- Return clear error:
  - "Reminder recently sent. Try again later."

Track throttling using:

- RequestReminderLog (recommended)
  - requestId
  - tenantId
  - sentAt
  - sentByUserId
  - recipientsCount


---

## Data Model (Minimum)

### RequestReminderLog

- id
- tenantId
- requestId
- sentAt (UTC)
- sentByUserId
- recipientsCount
- metadataJson (optional)

Indexes:

- (tenantId, requestId, sentAt DESC)


---

## Request Event

### RequestEvent: `request.reminder.sent`

Metadata (recommended):

- requestId
- sentByUserId
- recipientsCount
- recipientTypes: ["INTERNAL","EXTERNAL"] (optional)


---

## Audit Logging (K1)

AuditLog action:

- `request.reminder.sent`

Metadata:

- requestId
- sentByUserId
- recipientsCount


---

## Transaction Rules

- The reminder send operation should be:
  - idempotent per request per time window (rate limit)
  - safe if email fails

Recommended approach:

- Persist RequestReminderLog + RequestEvent first (transaction)
- Then send emails
- If sending fails:
  - keep event/log, but mark metadata with failure (optional)
  - do not retry automatically in v1 unless you have a job system


---

# Acceptance Criteria

- Finance/Creator can send a reminder at any time (subject to soft rate limit)
- Pending approver receives a reminder email
- Reminder action appears in timeline (`request.reminder.sent`)
- No reminders are sent to approvers who already responded
- Button is hidden when:
  - request is CLOSED
  - OR no pending approvers exist


---

# Edge Cases

- Some approvers responded, others pending:
  - email only pending ones

- Request CLOSED:
  - block and hide button

- External token expired/revoked:
  - do not send reminder to that external approver
  - optionally include in result summary “skipped due to expired link”

- Rapid repeated reminders:
  - blocked by soft rate limit

- Email sending failure:
  - return partial failure info (optional)
  - log failure in metadataJson


---

# Best Practices

- Filter recipients strictly by status = PENDING
- Do not leak tenant/request info to unauthorized users
- Keep rate limiting server-side
- Avoid hard-coded time windows; use configuration
- Store minimal recipient information; avoid storing full email bodies
- Include correlationId/traceId for debugging sends


---

# Future Enhancements (Not v1)

- Automatic reminders (scheduled)
- “Remind specific approver” option
- Retry queue for failed sends
- Reminder templates per tenant
- Multi-language reminders
