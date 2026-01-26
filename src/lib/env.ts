import "server-only";

/**
 * Environment variable validation and access
 * Validates required environment variables at startup
 */

const requiredEnvVars = {
  DATABASE_URL: process.env.DATABASE_URL,
  DATABASE_DIRECT_URL: process.env.DATABASE_DIRECT_URL,
  NEXTAUTH_URL: process.env.NEXTAUTH_URL,
  NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET,
} as const;

const optionalEnvVars = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
  GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
  EMAIL_FROM: process.env.EMAIL_FROM,
  RESEND_API_KEY: process.env.RESEND_API_KEY,
  BOOTSTRAP_ADMIN_EMAIL: process.env.BOOTSTRAP_ADMIN_EMAIL,
  PLATFORM_ADMIN_EMAILS: process.env.PLATFORM_ADMIN_EMAILS,
} as const;

/**
 * Validates that all required environment variables are set
 * Should be called at application startup
 */
export function validateEnv() {
  const missing: string[] = [];

  for (const [key, value] of Object.entries(requiredEnvVars)) {
    if (!value || value.trim() === "") {
      missing.push(key);
    }
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}\n` +
        "Please check your .env file or see .env.example for reference."
    );
  }
}

/**
 * Get required environment variable (throws if missing)
 */
export function getRequiredEnv(key: keyof typeof requiredEnvVars): string {
  const value = requiredEnvVars[key];
  if (!value || value.trim() === "") {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

/**
 * Get optional environment variable (returns undefined if missing)
 */
export function getOptionalEnv(key: keyof typeof optionalEnvVars): string | undefined {
  return optionalEnvVars[key];
}

// Validate on module load (skip during build if needed)
// Vercel builds may not have all runtime env vars, so we validate at runtime
const shouldValidate = 
  process.env.SKIP_ENV_VALIDATION !== "true" &&
  process.env.NEXT_PHASE !== "phase-production-build";

if (shouldValidate && (process.env.NODE_ENV === "production" || process.env.VALIDATE_ENV === "true")) {
  try {
    validateEnv();
  } catch (error) {
    console.error("Environment validation failed:", error);
    // In production runtime, we should fail fast
    // But during build, we allow it to continue (env vars may be set at runtime)
    if (process.env.NODE_ENV === "production" && process.env.NEXT_PHASE === undefined) {
      process.exit(1);
    }
  }
}
