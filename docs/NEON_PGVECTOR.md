# Neon: enable pgvector

Neon includes the **pgvector** extension. Before running Prisma migrations that add vector columns (or on a fresh database), enable it **once per database** (staging, production, etc.):

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

Run this in the Neon SQL editor (or any direct session to the database). Pooler connections can run DDL depending on Neon settings; using the **direct** connection or the Neon console is safest.

After enabling the extension, apply migrations as usual (`pnpm prisma migrate deploy`).

See also: [KB semantic search deployment](./KB_SEMANTIC_SEARCH.md).
