# I2 — Audit Bundle (ZIP Export)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

Generate a ZIP “Audit Bundle” that includes:

- Main Approval Packet PDF (I1)
- Linked request packets (if applicable)
- Optional related artifacts (future)

Feature available only for **Pro plan**.

Export must respect plan gating and permissions.


---

# Definition of Done


## Core Behavior

- User can trigger “Export bundle” from request detail view
- System validates plan allows bundle export
- System generates ZIP file containing:
  - Main request PDF packet
  - Linked request PDF packets (G1/G2)
- ZIP stored in object storage
- RequestEvent emitted:
  - `request.export.audit_bundle_generated`


---

## Plan Gating (Aligned with J1)

Before allowing bundle export:

1. Resolve tenant plan:
   - `resolveTenantPlan(tenantId)`
2. Validate feature flag:
   - `features.auditBundle = true`
3. If not allowed:
   - Return 403
   - OR hide button in UI (recommended both server + UI)

Plan rules:

- Pro:
  - Bundle export enabled
- Starter:
  - Not available
- Free:
  - Not available


---

## Authorization Rules

To export bundle, acting user must:

1. Have access to the request (C1)
AND
2. Have permission:
   - `tenant.requests.export`
   - OR Finance/Admin equivalent

If unauthorized:

- return 403 (or 404 if request not visible)


---

## Bundle Composition Rules

### Required Content

ZIP must include:

1. Main Request PDF (I1)
2. For each active linked request:
   - Generate or retrieve its PDF packet
   - Include inside ZIP

Linked requests included if:

- link.removedAt IS NULL
- user has access to linked request (C1)

If user does NOT have access to linked request:

- Exclude that linked request from bundle
- Do NOT leak its existence


---

## PDF Generation Strategy

For each request included:

Option A (recommended for v1):

- If PDF already exists:
  - Reuse stored export
- If not:
  - Generate on demand (using I1 logic)

All PDFs must respect their own watermark rules based on tenant plan.


---

## ZIP Structure Example

```
/AuditBundle_{RequestId}.zip
    /Main_Request_{RequestId}.pdf
    /Linked/
        /Request_{LinkedId1}.pdf
        /Request_{LinkedId2}.pdf
```

Naming conventions must be deterministic and safe.


---

## Data Model (Recommended)

### RequestExport (Extended)

Add exportType:

- PDF_APPROVAL_PACKET
- ZIP_AUDIT_BUNDLE

Fields:

- id
- tenantId
- requestId
- exportType
- provider
- objectKey
- filename
- createdAt
- createdByUserId

Indexes:

- (tenantId, requestId, exportType, createdAt DESC)


---

## Request Event

### `request.export.audit_bundle_generated`

Metadata:

- requestId
- exportId
- linkedCount
- createdByUserId


---

## Audit Logging (K1)

AuditLog action (canonical):

- `request.export.bundle_generated`

Metadata:

- requestId
- linkedCount
- actorUserId


---

# Acceptance Criteria

- In Pro plan:
  - “Export bundle” option is visible
  - ZIP export succeeds
  - Contains main PDF + linked PDFs
  - Event created
- In Starter/Free:
  - Option not visible
  - OR API returns 403

- ZIP file downloadable
- No cross-tenant data leakage


---

# Linked Requests Rules

Include only:

- Active links (removedAt IS NULL)
- Requests in same tenant
- Requests user has access to

Do NOT include:

- Soft-removed links
- Requests outside tenant
- Requests user cannot access


---

# Performance Considerations

- Avoid regenerating PDFs unnecessarily
- Consider background job for large bundles
- Limit maximum linked requests in v1 (optional safety limit)

Example limit:

- Max 50 linked packets per bundle


---

# Concurrency Safety

- Bundle generation + export record must be transactional
- If ZIP creation fails:
  - Do not persist export record
  - Do not emit event


---

# Edge Cases

- No linked requests:
  - ZIP contains only main PDF
- Linked request PDF generation fails:
  - Entire bundle fails (recommended strict behavior)
  - OR skip failed one (must be explicit; strict recommended for audit integrity)
- Request CLOSED:
  - Bundle still allowed
- Massive timeline/evidence:
  - PDFs may be large; enforce file size limit if needed


---

# Security Rules

- Enforce tenantId at every step
- Do not expose linked request IDs user cannot access
- Use signed URLs for download (short expiration)
- Validate permission server-side even if UI hides button


---

# Best Practices

- Reuse I1 export logic
- Use deterministic folder structure inside ZIP
- Log bundle generation for audit compliance
- Keep ZIP generation isolated in service layer
- Use streaming ZIP generation for large bundles


---

# Future Enhancements (Not v1)

- Include raw evidence files in ZIP
- Include CSV export of timeline
- Include audit log extract
- Custom naming conventions
- Bundle export history UI
- Email notification when bundle ready
```
