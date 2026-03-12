/**
 * Shared error message derivation for API responses.
 * Used by useApiFetch and can be used by any code that handles API errors.
 * Expects the architecture-mandated nested format: { error: { code, message, details } }
 */
export function getApiErrorMessage(
  res: Response,
  data: { error?: { code?: string; message?: string; details?: { code?: string } } }
): string {
  const err = data.error;
  if (err?.message && typeof err.message === "string") return err.message;
  if (err?.code === "FORBIDDEN") return "You don't have permission to do this.";
  if (err?.code === "UNAUTHENTICATED") return "Please sign in again.";
  if (err?.code === "CONFLICT") return "This action conflicts with existing data. Please try something else.";
  if (err?.code === "VALIDATION_ERROR") return "Please check the value and try again.";
  if (err?.code === "NOT_FOUND") return "The requested resource was not found.";
  if (err?.code === "UPGRADE_REQUIRED") return "Upgrade your plan to use this feature.";
  if (res.status === 403) return "You don't have permission to do this.";
  if (res.status === 401) return "Please sign in again.";
  if (res.status === 404) return "Not found.";
  if (res.status >= 500) return "Something went wrong on our side. Please try again.";
  return "Something went wrong. Please try again.";
}
