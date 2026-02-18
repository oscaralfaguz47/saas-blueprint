import { NextResponse } from "next/server";
import { ValidationError } from "@/lib/validations/common";

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
  const response: ApiError = {
    error,
  };

  if (message) {
    response.message = message;
  }

  if (details !== undefined) {
    response.details = details;
  }

  return NextResponse.json(response, { status });
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
  /** Conflict (e.g. duplicate slug); 409 */
  CONFLICT: (message?: string, details?: unknown) =>
    apiError("CONFLICT", 409, message ?? "Resource conflict", details),
  /** Rate limited; 429 */
  RATE_LIMITED: (message?: string) =>
    apiError("RATE_LIMITED", 429, message ?? "Too many requests"),
  /** Invitation no longer valid (revoked or expired); 404, client can show inline message and remove from list */
  INVITATION_REVOKED_OR_EXPIRED: () =>
    apiError("NOT_FOUND", 404, "This invitation was revoked or has expired.", {
      code: "INVITATION_REVOKED_OR_EXPIRED",
    }),
  /** Step-up required (re-authenticate within 10 min); 403 */
  STEP_UP_REQUIRED: (message?: string) =>
    apiError("FORBIDDEN", 403, message ?? "Recent authentication required.", {
      code: "STEP_UP_REQUIRED",
    }),
  /** MFA challenge expired; 401 */
  MFA_CHALLENGE_EXPIRED: (message?: string) =>
    apiError("UNAUTHORIZED", 401, message ?? "MFA challenge expired. Please sign in again.", {
      code: "MFA_CHALLENGE_EXPIRED",
    }),
  /** No pending 2FA setup; 409 */
  NO_PENDING_2FA_SETUP: (message?: string) =>
    apiError("CONFLICT", 409, message ?? "No pending 2FA setup.", {
      code: "NO_PENDING_2FA_SETUP",
    }),
  /** E6: Governance constraint (e.g. last Owner-level, exactly one Primary Owner); 409 */
  GOVERNANCE_CONSTRAINT_VIOLATION: (message?: string, details?: Record<string, unknown>) =>
    apiError("CONFLICT", 409, message ?? "Action would violate workspace governance.", {
      code: "GOVERNANCE_CONSTRAINT_VIOLATION",
      ...details,
    }),
  /** Invalid TOTP or backup code; 400 */
  INVALID_2FA_CODE: (message?: string) =>
    apiError("VALIDATION_ERROR", 400, message ?? "Invalid or expired code.", {
      code: "INVALID_2FA_CODE",
    }),
  /** MFA required — session is PENDING_MFA or 2FA not yet verified; 401 */
  MFA_REQUIRED: (message?: string) =>
    apiError("UNAUTHORIZED", 401, message ?? "Complete two-factor authentication to continue.", {
      code: "MFA_REQUIRED",
    }),
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
        if (error instanceof ValidationError) {
          return ApiErrors.VALIDATION_ERROR(error.message);
        }
        if (error.message.startsWith("Validation failed:")) {
          return ApiErrors.VALIDATION_ERROR("Please check the value and try again.");
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
