import { NextResponse } from "next/server";
import { PrismaClientKnownRequestError } from "@prisma/client/runtime/library";
import { ValidationError } from "@/lib/validations/common";

/**
 * Standardized API error response per ai-context/api-contract-validation-errors.md
 * Format: { error: { code, message, details } }
 */
export type ApiErrorBody = {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
};

/**
 * Creates a standardized error response
 */
export function apiError(
  code: string,
  status: number = 400,
  message?: string,
  details?: unknown
): NextResponse<ApiErrorBody> {
  const body: ApiErrorBody = {
    error: {
      code,
      message: message || code,
      ...(details !== undefined ? { details } : {}),
    },
  };

  return NextResponse.json(body, { status });
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
  /** Rate limited; 429 — optional Retry-After header (seconds) */
  RATE_LIMITED: (message?: string, options?: { retryAfterSeconds?: number }) => {
    const body: ApiErrorBody = {
      error: {
        code: "RATE_LIMITED",
        message: message ?? "Too many requests",
        ...(options?.retryAfterSeconds != null
          ? { details: { retryAfterSeconds: options.retryAfterSeconds } }
          : {}),
      },
    };
    const res = NextResponse.json(body, { status: 429 });
    if (options?.retryAfterSeconds != null) {
      res.headers.set("Retry-After", String(options.retryAfterSeconds));
    }
    return res;
  },
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
  /** Plan limit reached or subscription blocked; 403 */
  UPGRADE_REQUIRED: (message?: string) =>
    apiError("FORBIDDEN", 403, message ?? "Plan limit reached or subscription inactive. Upgrade to continue.", {
      code: "UPGRADE_REQUIRED",
    }),
  /** Request body exceeds size limit; 413 */
  PAYLOAD_TOO_LARGE: (message?: string) =>
    apiError("PAYLOAD_TOO_LARGE", 413, message ?? "Request body is too large."),
  /** Unsupported or missing Content-Type; 415 */
  UNSUPPORTED_MEDIA_TYPE: (message?: string) =>
    apiError("UNSUPPORTED_MEDIA_TYPE", 415, message ?? "Content-Type must be application/json."),
  /** Paddle rejected tax identifier (e.g. unsupported country); 400 — client can retry without Tax ID */
  TAX_IDENTIFIER_VALIDATION_FAILED: (message?: string) =>
    apiError("VALIDATION_ERROR", 400, message ?? "Tax identifier could not be validated for this country. You can continue without it.", {
      code: "TAX_IDENTIFIER_VALIDATION_FAILED",
    }),
  /** WebAuthn challenge expired or not found; 400 */
  PASSKEY_CHALLENGE_EXPIRED: (message?: string) =>
    apiError("VALIDATION_ERROR", 400, message ?? "Passkey challenge expired. Please try again.", {
      code: "PASSKEY_CHALLENGE_EXPIRED",
    }),
  /** WebAuthn credential verification failed; 401 */
  PASSKEY_VERIFICATION_FAILED: (message?: string) =>
    apiError("UNAUTHORIZED", 401, message ?? "Passkey verification failed. Please try again.", {
      code: "PASSKEY_VERIFICATION_FAILED",
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
      // 1. Prisma known errors — map to semantic HTTP status codes
      if (error instanceof PrismaClientKnownRequestError) {
        if (error.code === "P2002") {
          return ApiErrors.CONFLICT("A record with this value already exists.");
        }
        if (error.code === "P2025") {
          return ApiErrors.NOT_FOUND();
        }
        console.error("Prisma error:", { code: error.code, meta: error.meta });
        return ApiErrors.INTERNAL_ERROR();
      }

      // 2. Application-defined error types (preserve existing behavior)
      if (error instanceof Error) {
        if (error.name === "UpgradeRequiredError") {
          return ApiErrors.UPGRADE_REQUIRED(error.message);
        }
        if (error.name === "TaxIdentifierValidationError") {
          return ApiErrors.TAX_IDENTIFIER_VALIDATION_FAILED(error.message);
        }
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
        if (error.message === "PAYLOAD_TOO_LARGE") {
          return ApiErrors.PAYLOAD_TOO_LARGE();
        }
        if (error.message === "UNSUPPORTED_MEDIA_TYPE") {
          return ApiErrors.UNSUPPORTED_MEDIA_TYPE();
        }
        if (error instanceof SyntaxError) {
          return ApiErrors.VALIDATION_ERROR("Invalid request body format");
        }
        console.error("API Error:", error);
        return ApiErrors.INTERNAL_ERROR();
      }

      console.error("API Error (unknown):", error);
      return ApiErrors.INTERNAL_ERROR();
    }
  };
}
