# C3 — Request Filters

## Scope

Implement combinable filters for request list views (C2) with validation and performant queries.

Filters:

- status
- type
- date range
- search (title/description)
- amount range
- currency
- PAYABLE-only:
  - payment status
  - has payment evidence
- linked:
  - yes/no
- has evidence:
  - yes/no


---

# Definition of Done


## General Requirements

- Filters are implemented and **combinable**
- All filter params are validated server-side
- Sorting options supported:
  - newest
  - amount desc
  - pending first (in Inbox)
- Queries remain performant (indexes + correct joins/exists)
- Filters respect access rules (C1) and tab scoping (C2)


---

## Filter Definitions


### Status Filter

- Filter by request.status (e.g., OPEN, CLOSED)
- If multiple statuses supported:
  - allow list parameter

Validation:

- status must be within allowed enum set


---

### Type Filter

- Filter by request.type (RequestType)

Validation:

- type must exist and be valid for tenant (if tenant-scoped types exist)


---

### Date Range Filter

- Filter by createdAt between start and end

Validation:

- startDate <= endDate
- max range (optional, to protect performance)


---

### Search Filter (Title/Description)

- Search must match:
  - title
  - description (if exists)

Implementation choices:

- v1 simple:
  - LIKE/ILIKE with indexing strategy
- or full-text search if already planned (Starter feature in J1)

Validation:

- min length (optional) to avoid heavy queries
- max length (e.g., 200 chars)


---

### Amount Range Filter

- Filter by amount >= min AND amount <= max

Validation:

- minAmount <= maxAmount
- amounts >= 0
- handle null amounts:
  - default behavior: exclude nulls when filtering by range


---

### Currency Filter

- Filter by currency code (ISO 4217 recommended)

Validation:

- format: 3-letter uppercase
- allow a known set if configured


---

## Payable Filters (Only Apply to Payable Requests)

These filters must apply ONLY if request type is payable.

If user passes payment filters for non-payable request types:

- Return validation error OR
- Ignore payment filters (recommended: validation error to avoid confusion)

### Payment Status Filter

- Filter by RequestPayment.status (H1)
  - NOT_PAID
  - PENDING
  - PAID

Implementation:

- JOIN RequestPayment or EXISTS subquery


### Has Payment Evidence Filter

- yes/no based on existence of active payment evidence (H2)

Definition:

- hasPaymentEvidence = true if exists RequestPaymentEvidence where removedAt IS NULL

Implementation:

- EXISTS subquery (recommended)


---

## Linked Filter (Yes/No)

Definition:

- linked = true if request has at least one active RequestLink (G1) where removedAt IS NULL

Implementation:

- EXISTS subquery on RequestLink
- Consider both fromRequestId OR toRequestId

Validation:

- boolean only


---

## Has Evidence Filter (Yes/No)

Definition:

- hasEvidence = true if request has at least one active evidence record:
  - file evidence (D1)
  - evidence link (D2)
  - where deletedAt IS NULL

Implementation:

- EXISTS subquery on RequestEvidence


---

## Sorting Options

### Newest

- ORDER BY request.createdAt DESC

### Amount Desc

- ORDER BY request.amount DESC, request.createdAt DESC
- define null handling:
  - nulls last (recommended)

### Pending First (Inbox only)

- Primary: pendingAction DESC (derived flag)
- Secondary: criticalFirst DESC
- Tertiary: createdAt DESC

Rules:

- Pending-first sorting only applies to Inbox queries (C2)
- Other tabs default to newest


---

## Performance Requirements

- Queries must use indices and avoid heavy joins when possible
- Prefer EXISTS for filters based on linked/evidence/payment evidence

Recommended indexes:

Request:
- (tenantId, createdAt DESC)
- (tenantId, status, createdAt DESC)
- (tenantId, type, createdAt DESC)
- (tenantId, currency, createdAt DESC)
- (tenantId, amount)

RequestPayment:
- (tenantId, status)

RequestPaymentEvidence:
- (tenantId, requestId, removedAt)

RequestEvidence:
- (tenantId, requestId, deletedAt)

RequestLink:
- (tenantId, fromRequestId, removedAt)
- (tenantId, toRequestId, removedAt)


---

# Acceptance Criteria

- Filtering by type returns only that type
- Search matches title/description
- Payment filters apply only to payable request types
- Linked yes/no filter works correctly
- Has evidence yes/no filter works correctly
- Filters can be combined without breaking results
- Sorting works:
  - newest
  - amount desc
  - pending first (Inbox)


---

# Edge Cases

- Invalid filter values:
  - return 400 with clear validation error
- Amount range with missing boundaries:
  - allow min-only or max-only
- Search term empty:
  - ignore search filter
- Payment filters + mixed types:
  - recommended: require payableOnly=true or return validation error
- Very large tenant dataset:
  - pagination mandatory
  - enforce reasonable max page size


---

# Security Rules

- All queries must enforce tenantId
- Must enforce access rules (C1)
- Finance filters must still be access-scoped unless user has read_all


---

# Best Practices

- Centralize filtering logic in one query builder/service
- Use explicit param validation layer
- Prefer EXISTS over JOIN for boolean filters (linked/evidence)
- Make filters deterministic and documented
- Keep default sorting consistent per tab


---

# Future Enhancements (Not v1)

- Saved filters per user
- Advanced full-text search (stemming, ranking)
- Filter chips UI
- Export filtered results
- Facets/counts per filter (e.g., status counts)
