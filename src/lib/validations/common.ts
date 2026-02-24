import { z } from "zod";

/**
 * Thrown by parseBody when Zod validation fails. Message is user-facing (no "Validation failed:" or path).
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

/**
 * Turn Zod's default messages into short, user-friendly text for the UI.
 */
function formatValidationMessage(zodMessage: string): string {
  const m = zodMessage.trim();
  // "Too big: expected string to have <=10 characters" -> "Must be 10 characters or less."
  const tooBigString = m.match(/Too big:\s*expected string to have <=(\d+) character/i);
  if (tooBigString) return `Must be ${tooBigString[1]} characters or less.`;
  // "Too small: expected string to have >=6 characters" -> "Must be at least 6 characters."
  const tooSmallString = m.match(/Too small:\s*expected string to have >=(\d+) character/i);
  if (tooSmallString) return `Must be at least ${tooSmallString[1]} characters.`;
  // "expected number to be >=1" etc.
  const numMin = m.match(/expected number to be >=(\d+)/i);
  if (numMin) return `Must be at least ${numMin[1]}.`;
  const numMax = m.match(/expected number to be <=(\d+)/i);
  if (numMax) return `Must be ${numMax[1]} or less.`;
  // "String must contain at most N character(s)" (Zod variant)
  const atMost = m.match(/at most (\d+) character/i);
  if (atMost) return `Must be ${atMost[1]} characters or less.`;
  const atLeast = m.match(/at least (\d+) character/i);
  if (atLeast) return `Must be at least ${atLeast[1]} characters.`;
  // Strip "Too big: " / "Too small: " prefix if no pattern matched
  const stripped = m.replace(/^Too (big|small):\s*/i, "").trim();
  return stripped || "Please check the value and try again.";
}

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
 * Convert a ZodError into a map of field keys to user-facing messages.
 * pathToKey maps the Zod path array (e.g. ["contact", "name"]) to the UI field key (e.g. "contactName").
 * Uses formatValidationMessage for consistent messaging.
 */
export function zodErrorToFieldErrors(
  error: z.ZodError,
  pathToKey: (path: (string | number)[]) => string
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = pathToKey(issue.path as (string | number)[]);
    const message = formatValidationMessage(issue.message);
    if (key && !out[key]) out[key] = message;
  }
  return out;
}

/**
 * Parse and validate request body with Zod.
 * Throws ValidationError with a user-facing message (no "Validation failed:" or field path).
 */
export async function parseBody<T>(req: Request, schema: z.ZodSchema<T>): Promise<T> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    throw new ValidationError("Invalid request body format");
  }

  try {
    return schema.parse(body);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const first = error.issues[0];
      const message = first ? formatValidationMessage(first.message) : "Please check the value and try again.";
      throw new ValidationError(message);
    }
    throw error;
  }
}
