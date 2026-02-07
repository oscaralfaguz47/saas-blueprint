# D1 — Request File Attachments (Evidence)

## Scope

- Upload a file, store metadata, and associate it with a request
- Support soft-delete (if applicable)
- Ensure evidence visibility in:
  - request detail view
  - exports (PDF / ZIP when enabled)


---

# Definition of Done


## Core Behavior

- A user can upload an evidence file and attach it to a request
- System stores file metadata and an immutable reference to the stored object
- Evidence is linked to exactly one request (v1)
- Evidence can be soft-deleted (optional in v1, but model must support it)
- A RequestEvent is created:
  - `request.evidence.added`
- An AuditLog entry is created (canonical action key, K1):
  - `request.evidence.file_added`


---

## Authorization Rules

To upload evidence, the user must:

1. Have access to the request (C1)
AND
2. Have permission:
   - `tenant.evidence.add`

If either fails:

- return 403 (or 404 to avoid information leakage, recommended: 404 when request is not visible)


---

## Storage + Metadata Requirements

Evidence metadata stored:

- provider (e.g., S3 | R2 | AzureBlob)
- objectKey (storage key/path)
- filename (original name)
- mime (content type)
- size (bytes)
- sha256 (optional but recommended)
- createdAt (UTC)
- createdByUserId
- deletedAt (nullable)
- deletedByUserId (nullable)

Rules:

- objectKey must be unique per file
- filename is stored for display (do not rely on it for security)
- sha256 is optional, but if present must be computed server-side or verified


---

## Data Model (Minimum)

### RequestEvidence

- id
- tenantId
- requestId
- provider
- objectKey
- filename
- mime
- size
- sha256 (nullable)
- createdAt
- createdByUserId
- deletedAt (nullable)
- deletedByUserId (nullable)

Constraints / Indexes:

- Index: (tenantId, requestId, createdAt DESC)
- Index: (tenantId, objectKey) UNIQUE (recommended)
- If soft-delete is used:
  - queries must filter deletedAt IS NULL by default


---

## Upload Flow (Best Practice)

1. Validate user has request access (C1)
2. Validate permission `tenant.evidence.add`
3. Validate file constraints:
   - max size (configurable)
   - allowed mime types (configurable)
4. Upload object to storage provider
5. Persist RequestEvidence row with metadata
6. Emit RequestEvent `request.evidence.added`
7. Write AuditLog entry `request.evidence.file_added`
8. Commit

Transaction rule:

- If DB save fails → uploaded object must be cleaned up (best effort) OR marked orphaned for cleanup job


---

## Soft Delete (If Enabled)

- Evidence is not physically removed immediately
- Fields updated:
  - deletedAt
  - deletedByUserId

Rules:

- Soft-deleted evidence:
  - does not appear in request detail
  - does not appear in exports
- Optional: emit event `request.evidence.removed` and audit log entry


---

## Visibility in UI + Exports

- Evidence list appears in Request Detail view
- Evidence is included in:
  - PDF export (as links or embedded references depending on design)
  - ZIP export (when Pro enables ZIP)


---

# Acceptance Criteria

- Creator can upload evidence to their request (assuming permission is granted)
- A user without request access cannot upload evidence
- A user with request access but without `tenant.evidence.add` cannot upload evidence
- Evidence appears in:
  - request detail view
  - export output (PDF and/or ZIP depending on plan)

- RequestEvent `request.evidence.added` is created on success
- AuditLog `request.evidence.file_added` is written
- Evidence metadata is stored correctly:
  - provider, objectKey, filename, mime, size, sha256 (optional)


---

# Edge Cases

- Upload to a CLOSED request:
  - Option A (recommended): block with "Request is closed"
  - Option B: allow evidence add if business wants it (must be explicit)
  - Default for v1: BLOCK

- Duplicate uploads:
  - Allowed (different objectKey), unless you implement sha256 dedup (future)

- File upload succeeds but DB write fails:
  - best-effort delete object
  - log orphan cleanup event

- Very large files:
  - enforce max size
  - return clear error

- Dangerous file types:
  - block executable types by policy


---

# Best Practices

- Always validate permissions server-side
- Store evidence references (objectKey), not raw paths in UI
- Use tenant-scoped objectKey paths:
  - tenant/{tenantId}/requests/{requestId}/evidence/{evidenceId}/{filename}
- Keep metadata immutable after creation (except soft-delete fields)
- Prefer sha256 hashing for integrity and future deduplication
- Default queries exclude soft-deleted evidence


---

# Future Enhancements (Not v1)

- Multiple evidence files per export bundle with naming rules
- Evidence versioning
- Virus scanning pipeline
- Signed URLs with expiration
- Evidence access audit (e.g., `request.evidence.downloaded`)
- Deduplication by sha256 within tenant
