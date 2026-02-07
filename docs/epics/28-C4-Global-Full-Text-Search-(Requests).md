# C4 — Global Full-Text Search (Requests)

> Implement per **00-EPIC-QUALITY-AND-PRACTICES.md** and `.cursor/rules`.

## Scope

Provide a single global search input for requests that searches across key fields and works together with existing filters (C3).

Searchable fields:

- title
- description
- clientName / supplier
- amount (string match)
- currency
- comments (v1.1 optional, recommended)


---

# Definition of Done


## Core Behavior

- A single search input is visible in the requests list UI (applies to tabs in C2)
- Search is combinable with existing filters (C3)
- Search returns relevant results for partial text (no exact match required)
- Performance must be acceptable on large datasets
- Implementation uses:
  - PostgreSQL full-text search (tsvector)
  - plus optimized functional indexes where appropriate


---

## Authorization + Tenant Boundary

- Search results must respect:
  - tenantId boundary
  - access rules (C1)
- Search must not leak results from other tenants
- Search must not return requests the user cannot access (unless Finance read_all)


---

## Search Query Semantics

### Text Search

- Query should support:
  - partial tokens (prefix matching) where possible
  - relevance ranking
  - normalization (lowercase, trim)
- Default behavior:
  - match on title/description/client/supplier

Recommended approach:

- Use `tsvector` composed of:
  - title
  - description
  - clientName/supplier

Weighting (recommended):

- title: highest
- client/supplier: medium
- description: lower


---

### Amount Search (String Match)

If search input is numeric-like:

- perform a secondary match against amount formatted as string
- Example:
  - input: `1200` matches amount `1200.00`

Implementation options:

- Parse numbers:
  - if parse succeeds → apply amount equality or range proximity
- Or fallback string contains match on formatted amount (less ideal)

Recommendation:

- If input parses as decimal:
  - filter where amount = value (or within rounding tolerance)


---

### Currency Search

- Support searching currency codes like:
  - USD
  - EUR
- This should be a simple exact/ILIKE match on currency column in addition to FTS.


---

## Data Model / Indexing Strategy

### Option A (Recommended): Generated Search Vector

Add computed/search column:

- `search_vector` (tsvector)

Contains concatenation of:

- title
- description
- clientName/supplier

Then create index:

- GIN index on `search_vector`

Also keep standard indexes:

- (tenantId, createdAt)
- (tenantId, status)
- (tenantId, type)
- (tenantId, currency)
- (tenantId, amount)


---

## Query Implementation (Conceptual)

Given:

- tenantId
- user access scope (C1)
- filters (C3)
- searchTerm

Apply in order:

1. Access scope (C1): restrict request IDs user can see
2. Apply filters (C3)
3. Apply full-text search:
   - `search_vector @@ plainto_tsquery(searchTerm)`
4. Apply numeric/currency supplemental filters if detected
5. Sort:
   - by relevance rank DESC
   - then createdAt DESC

Pagination required.


---

## Combining with C3 Filters

Search must work with any combination of:

- status, type, date range
- amount range, currency
- payable filters
- linked / has evidence

Rules:

- Search is just another predicate in the list query builder
- Filters must not “override” search
- Search does not change tab scoping rules (C2)


---

## Performance Requirements

- Must use indexes:
  - GIN index on tsvector
  - standard btree indexes for filters
- Must be paginated
- Must be tenant-scoped early in the query
- Avoid joining comments in v1 unless required (v1.1)


---

## UI Requirements

- Single global search input visible in request list
- Search term persists across:
  - tabs
  - filters
  - pagination
- Clear action resets search + filters


---

# Acceptance Criteria

- Partial text search returns relevant results
  - no exact match required
- Search works together with filters (C3)
- Searching in large lists remains performant
- Search respects:
  - tenant boundary
  - access rules (C1)
- Searching `USD` returns requests with currency USD
- Searching `1200` can match a request with amount 1200.00 (string/numeric match)


---

# Edge Cases

- Empty search:
  - treated as no search filter
- Very short terms (e.g., 1 char):
  - optionally block or require min length (recommended: min 2–3 chars)
- Special characters:
  - sanitized before building query
- Mixed numeric + text (e.g., `acme 1200`):
  - treat as text query + optional numeric hint


---

# Security Rules

- No cross-tenant data leakage
- Do not show results without access
- Avoid exposing ranking internals or raw SQL errors


---

# Best Practices

- Build a single query builder used by all tabs (C2) + filters (C3) + search (C4)
- Use weighted tsvector for better relevance
- Keep amount/currency as supplemental predicates (not in tsvector)
- Use cursor pagination for scalability
- Add instrumentation for query timing


---

# Future Enhancements (v1.1)

- Include comments in search:
  - maintain separate comment_search_vector per request
  - update vector on new comment (async job)
- Synonyms and stemming tuning
- Search highlights/snippets
- Advanced query syntax (quoted phrases)
- Saved searches
