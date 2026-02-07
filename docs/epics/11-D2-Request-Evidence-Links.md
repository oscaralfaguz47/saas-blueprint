# D2 — Request Evidence Links

## Scope

- Allow adding an external URL as evidence to a request
- Store URL + label (display name)
- Apply same access rules as file evidence (D1)
- Support optional soft-delete
- Ensure links appear in:
  - request detail view
  - exports (PDF / ZIP)


---

# Definition of Done


## Core Behavior

- A user can attach an external URL to a request
- System stores:
  - normalized URL
  - label (human-friendly name)
- Link is associated with exactly one request
- A RequestEvent is created:
  - `request.evidence.added`
  - type = "LINK"
- An AuditLog entry is created (aligned with K1):
  - `request.evidence.added`
  - metadata indicates evidenceType = LINK

Permissions must match D1 (file evidence).


---

## Authorization Rules

To add an evidence link, the user must:

1. Have access to the request (C1)
AND
2. Have permission:
   - `tenant.evidence.add`

If either fails:

- return 403 (or 404 if request not visible; recommended: 404)


---

## URL Validation Requirements

The system must validate:

- URL is well-formed (RFC-compliant)
- Only http:// or https:// allowed
- No javascript:, file:, or other unsafe protocols
- Max length enforced (e.g., 2048 characters)
- Label is required and length-limited (e.g., 255 chars)

Optional (recommended for future):

- Normalize URL before storing
- Remove trailing spaces
- Enforce lowercase protocol


---

## Data Model (Minimum)

### RequestEvidence (Extended for Links)

Shared table for files and links (recommended design).

Fields:

- id
- tenantId
- requestId
- evidenceType (FILE | LINK)
- label
- url (nullable; required if evidenceType = LINK)
- provider (nullable; only for FILE)
- objectKey (nullable; only for FILE)
- mime (nullable)
- size (nullable)
- sha256 (nullable)
- createdAt
- createdByUserId
- deletedAt (nullable)
- deletedByUserId (nullable)

Constraints:

- If evidenceType = LINK:
  - url NOT NULL
  - provider/objectKey NULL
- If evidenceType = FILE:
  - provider/objectKey NOT NULL
  - url NULL

Indexes:

- (tenantId, requestId, createdAt DESC)
- (tenantId, requestId, evidenceType)


---

## Add Link Flow

1. Validate user access to request (C1)
2. Validate permission `tenant.evidence.add`
3. Validate URL + label
4. Insert RequestEvidence row (evidenceType = LINK)
5. Emit RequestEvent:
   - `request.evidence.added`
   - metadata: evidenceType = LINK
6. Write AuditLog entry
7. Commit transaction


---

## Soft Delete (Optional)

If enabled:

- Update:
  - deletedAt
  - deletedByUserId

Soft-deleted links:

- Do not appear in request detail
- Do not appear in exports

Optional events:

- `request.evidence.removed`


---

## Visibility in UI + Exports

- Links appear in Request Detail view under Evidence section
- Links are included in:
  - PDF export (as clickable hyperlink)
  - ZIP export (e.g., links.txt or metadata.json)

Export inclusion must respect plan limits (Starter/Pro).


---

# Acceptance Criteria

- Creator (with permission) can add link to their request
- User without request access cannot add link
- User with request access but without `tenant.evidence.add` cannot add link
- Link appears in:
  - request detail view
  - export output

- URL is validated (reject invalid or unsafe protocols)
- RequestEvent `request.evidence.added` is created with type LINK
- AuditLog entry is created


---

# Edge Cases

- Add link to CLOSED request:
  - Default v1: block with "Request is closed"
  - Must follow same rule as file evidence (D1)

- Very long URL:
  - Block with validation error

- Duplicate link:
  - Allowed unless dedup logic implemented (future)

- Malicious URL:
  - Reject if protocol not http/https
  - Do not attempt to fetch or validate external resource in v1


---

# Best Practices

- Use a unified RequestEvidence table for FILE and LINK
- Always validate URL server-side
- Normalize URL before storing
- Never auto-embed external content (avoid SSRF risk)
- Enforce tenant scoping on all queries
- Default queries exclude soft-deleted records


---

# Future Enhancements (Not v1)

- URL preview metadata (title, favicon)
- Automatic domain extraction
- Link expiration rules
- Access tracking (e.g., `request.evidence.link.clicked`)
- External storage verification pipeline
