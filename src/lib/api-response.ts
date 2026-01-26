import { NextResponse } from "next/server";

/**
 * Standardized API error response
 */
export type ApiError = {
  error: string;
  message?: string;
  details?: unknown;
};

/**
 * Creates a standardized error response
 */
export function apiError(
  error: string,
  status: number = 400,
  message?: string,
  details?: unknown
): NextResponse<ApiError> {
  return NextResponse.json(
    {
      error,
      ...(message && { message }),
      ...(details && { details }),
    },
    { status }
  );
}

/**
 * Creates a standardized success response
 */
export function apiSuccess<T>(data: T, status: number = 200): NextResponse<{ data: T }> {
  return NextResponse.json({ data }, { status });
}

/**
 * Common error responses
 */
export const ApiErrors = {
  UNAUTHENTICATED: () => apiError("UNAUTHENTICATED", 401, "Authentication required"),
  FORBIDDEN: () => apiError("FORBIDDEN", 403, "Insufficient permissions"),
  NOT_FOUND: (resource?: string) =>
    apiError("NOT_FOUND", 404, resource ? `${resource} not found` : "Resource not found"),
  VALIDATION_ERROR: (message: string, details?: unknown) =>
    apiError("VALIDATION_ERROR", 400, message, details),
  INTERNAL_ERROR: (message?: string) =>
    apiError("INTERNAL_ERROR", 500, message || "An internal error occurred"),
  NO_TENANT: () => apiError("NO_TENANT", 403, "No active tenant found"),
} as const;

/**
 * Wraps an API route handler with error handling
 */
export function withErrorHandler<T extends unknown[]>(
  handler: (...args: T) => Promise<NextResponse>
) {
  return async (...args: T): Promise<NextResponse> => {
    try {
      return await handler(...args);
    } catch (error) {
      console.error("API Error:", error);

      // Handle known error types
      if (error instanceof Error) {
        // Validation errors from parseBody
        if (error.message.startsWith("Validation failed:")) {
          return ApiErrors.VALIDATION_ERROR(error.message);
        }
        if (error.message === "Invalid JSON in request body") {
          return ApiErrors.VALIDATION_ERROR("Invalid request body format");
        }
        if (error.message === "UNAUTHORIZED") {
          return ApiErrors.FORBIDDEN();
        }
        if (error.message === "UNAUTHENTICATED") {
          return ApiErrors.UNAUTHENTICATED();
        }
        return apiError("INTERNAL_ERROR", 500, error.message);
      }

      return ApiErrors.INTERNAL_ERROR();
    }
  };
}
