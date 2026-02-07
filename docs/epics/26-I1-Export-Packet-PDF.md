# I1 — Export Packet (PDF)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

Generate a single “Approval Packet” PDF for a request, containing sections:

- Summary
- Linked Requests
- Evidence (files + links)
- Approvals (internal + external)
- Payment (if applicable)
- Timeline (events + comments)

The PDF must be stored in object storage and be accessible for download (tenant-scoped).


---

# Definition of Done


## Core Behavior

- User triggers “Export PDF”
- System generates a PDF packet with the required sections
- PDF is stored in storage provider (e.g., S3/R2/AzureBlob)
- System creates a RequestEvent:
  - `request.export.approval_packet_generated`
- Export respects plan gating (J1) and monthly counters (J2):
  - consumes monthly export count
  - blocks when limit exceeded (with clear error)
- PDF respects watermark rules per plan:
  - Free: watermark ON
  - Starter: watermark configurable (recommended OFF)
  - Pro: watermark OFF


---

## Authorization Rules

To export PDF, acting user must:

1. Have access to the request (C1)
AND
2. Have permission:
   - `tenant.requests.export`
   - OR role equivalent

If not authorized:

- return 403 (or 404 if request not visible)


---

## Gating + Monthly Counters (Aligned with J1 + J2)

Before generating the PDF:

1. Resolve tenant plan:
   - `resolveTenantPlan(tenantId)` (J1)
2. Validate plan feature:
   - PDF export allowed?
3. Consume export monthly usage atomically:
   - `tryConsumeExport(tenantId, yearMonth, maxExportsPerMonth)` (J2)
   - if false → block:
     - "Upgrade required"
4. Generate PDF
5. Store PDF in storage
6. Persist Export record + events/logs
7. Commit transaction

Rules:

- Counter increments only on successful export (commit-safe)
- No “successful counter” if PDF generation/storage fails


---

## PDF Content Requirements

### Section: Summary

- Request ID
- Title
- Type
- Status
- Created by + createdAt
- Amount/currency (if present)

### Section: Linked Requests

- List active links (G1/G2)
- Include linkType and linked request basic info

### Section: Evidence

- File evidence list (D1)
- Evidence links list (D2)
- Include filename/label + uploaded by + date
- Include URLs as text (and clickable if supported)

### Section: Approvals

- Internal approvers:
  - name/email + status + respondedAt
- External approvers:
  - email + status + respondedAt

### Section: Payment (If Payable)

- Payment status (H1)
- Payment evidence list (H2)
- If PAID with no proof:
  - show “Paid missing proof” indicator

### Section: Timeline

- Chronological events + comments (F1–F3)
- Highlight critical items (rejection reasons, unread critical notes if applicable)


---

## Storage + Export Record

PDF stored with:

- provider
- objectKey
- filename
- mime = application/pdf
- size
- sha256 (optional)

### RequestExport (Recommended)

- id
- tenantId
- requestId
- exportType = PDF_APPROVAL_PACKET
- provider
- objectKey
- filename
- watermarkApplied (bool)
- createdAt
- createdByUserId

Indexes:

- (tenantId, requestId, createdAt DESC)


---

## Watermark Rules (Per Plan)

- Free:
  - watermarkApplied = true
  - PDF must visibly show watermark (e.g., “Generated with Free Plan”)
- Starter:
  - recommended: watermarkApplied = false
  - (If you keep it, must be consistent with plan config)
- Pro:
  - watermarkApplied = false


---

## Request Event

### `request.export.approval_packet_generated`

Metadata (recommended):

- requestId
- exportId
- exportType
- watermarkApplied
- createdByUserId


---

## Audit Logging (K1)

AuditLog action (canonical):

- `request.export.pdf_generated`

Metadata:

- requestId
- exportId
- actorUserId
- watermarkApplied


---

# Acceptance Criteria

- Free plan:
  - Allows 1 export per month (with watermark)
  - 2nd export in same month is blocked:
    - "Upgrade required"

- Starter plan:
  - Allows up to 50 exports per month
  - Exports succeed and consume counter

- Pro plan:
  - Unlimited exports (or very high limit)
  - No watermark

- PDF includes all required sections
- PDF is generated and stored successfully
- RequestEvent is created
- Monthly export counter increments only when export succeeds


---

# Edge Cases

- Request not accessible:
  - 404/403
- Request CLOSED:
  - export still allowed (recommended)
- PDF generation fails:
  - no counter increment
  - return error + log
- Storage upload fails:
  - rollback export creation
  - no counter increment
- Very large evidence/timeline:
  - paginate or limit timeline section (must be explicit)
  - include “truncated” note if limited


---

# Concurrency Safety

- Export counter consumption must be atomic (J2)
- Prevent double export from double-click:
  - idempotency key per request per user per minute (optional)
  - or rely on rate limiting at endpoint


---

# Best Practices

- Generate PDF server-side (not in browser)
- Use deterministic rendering templates
- Store generated PDFs for re-download (avoid regenerating)
- Use signed URLs for downloads with short expiry
- Add correlationId for export job debugging
- Keep export pipeline resilient (clear failure modes)


---

# Future Enhancements (Not v1)

- Regenerate vs reuse last export
- Export history UI
- ZIP bundle export (I2 / Pro)
- Custom branding (logo, footer)
- Multi-language PDF output
- Background job processing + notifications
