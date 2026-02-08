import { z } from "zod";

/**
 * Shared validation primitives and helpers used across domains.
 */

export const emailSchema = z.string().email("Invalid email address").toLowerCase().trim();

export const cuidSchema = z.string().cuid("Invalid ID format");

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

/**
 * Parse and validate request body with Zod.
 * Throws an error that can be caught by withErrorHandler.
 */
export async function parseBody<T>(req: Request, schema: z.ZodSchema<T>): Promise<T> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    throw new Error("Invalid JSON in request body");
  }

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const messages = error.issues.map((e: z.ZodIssue) => {
        const path = e.path.length > 0 ? e.path.join(".") : "root";
        return `${path}: ${e.message}`;
      });
      throw new Error(`Validation failed: ${messages.join(", ")}`);
    }
    throw error;
  }
}
