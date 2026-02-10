/**
 * Shared error message derivation for API responses.
 * Used by useApiFetch and can be used by any code that handles API errors.
 */
export function getApiErrorMessage(
  res: Response,
  data: { error?: string; message?: string; details?: { code?: string } }
): string {
  if (data.message && typeof data.message === "string") return data.message;
  if (data.error === "FORBIDDEN") return "You don't have permission to do this.";
  if (data.error === "UNAUTHENTICATED") return "Please sign in again.";
  if (data.error === "CONFLICT") return "This action conflicts with existing data. Please try something else.";
  if (data.error === "VALIDATION_ERROR") return "Please check the value and try again.";
  if (data.error === "NOT_FOUND") return "The requested resource was not found.";
  if (data.error === "UPGRADE_REQUIRED") return "Upgrade your plan to use this feature.";
  if (res.status === 403) return "You don't have permission to do this.";
  if (res.status === 401) return "Please sign in again.";
  if (res.status === 404) return "Not found.";
  if (res.status >= 500) return "Something went wrong on our side. Please try again.";
  return "Something went wrong. Please try again.";
}
