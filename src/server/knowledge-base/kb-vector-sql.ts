import "server-only";

/**
 * Formats a float array as a PostgreSQL vector literal for use with `::vector` casts.
 * Does not log contents. Used only with parameterized Prisma `$queryRaw` / `$executeRaw` fragments.
 */
export function formatVectorForSql(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}
