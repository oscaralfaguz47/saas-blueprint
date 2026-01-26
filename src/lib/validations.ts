import { z } from "zod";

/**
 * Common validation schemas
 */

export const emailSchema = z.string().email("Invalid email address").toLowerCase().trim();

export const cuidSchema = z.string().cuid("Invalid ID format");

/**
 * Record creation schema
 */
export const createRecordSchema = z.object({
  title: z.string().min(1, "Title is required").max(160, "Title must be 160 characters or less"),
  type: z.enum(["SCOPE_CHANGE", "DECISION", "BUDGET"], {
    message: "Invalid record type",
  }),
  description: z.string().max(5000, "Description too long").optional(),
  clientName: z.string().max(120, "Client name too long").optional(),
  clientEmail: emailSchema.optional(),
  amount: z.number().positive("Amount must be positive").optional(),
  currency: z.string().length(3, "Currency must be 3 characters (ISO code)").optional(),
  visibility: z.enum(["WORKSPACE", "RESTRICTED"]).default("WORKSPACE"),
  isSensitive: z.boolean().default(false),
});

/**
 * Invitation creation schema
 */
export const createInvitationSchema = z.object({
  email: emailSchema,
});

/**
 * Pagination schema
 */
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(50),
});

/**
 * Accept invitation schema
 */
export const acceptInvitationSchema = z.object({
  token: z.string().min(20, "Token must be at least 20 characters"),
});

/**
 * Parse and validate request body with Zod
 * Throws an error that can be caught by withErrorHandler
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
