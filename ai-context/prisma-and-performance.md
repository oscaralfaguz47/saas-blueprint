# Prisma and Performance

## Purpose
Defines database access patterns and performance guidelines.

---

# Query Discipline

Prefer:
select

over:
include

Avoid loading unnecessary relations.

---

# Avoid N+1 Queries

Use:

- batched queries
- proper joins
- relation includes only when needed

---

# Transactions

Transactions must:

- remain short
- avoid heavy loops

---

# Indexed Queries

Queries should leverage indexed columns:

- tenantId
- createdAt
- status
- foreign keys

---

# Migrations

Local:
prisma migrate dev

Production:
prisma migrate deploy


Never use `db push` in production.

---

## Related Documents

- ../GEMINI.md
- ./security-multitenancy.md

