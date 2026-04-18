import "server-only";

import { z } from "zod";

/**
 * Centralized environment variable validation.
 * All server-side env vars must be accessed through this module.
 * Never import this in client components — it is server-only.
 *
 * Documented exceptions (accessed directly, not through this module):
 * - process.env.NODE_ENV — Node.js runtime constant
 * - process.env.NEXT_PHASE — Vercel build lifecycle control
 * - process.env.SKIP_ENV_VALIDATION — build-time escape hatch
 * - NEXT_PUBLIC_* in client components — cannot import server-only in browser
 */

const envSchema = z.object({
  // ── Database ────────────────────────────────────────────────────────────
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  DATABASE_DIRECT_URL: z.string().min(1, "DATABASE_DIRECT_URL is required"),

  // ── Authentication ──────────────────────────────────────────────────────
  NEXTAUTH_URL: z.string().url("NEXTAUTH_URL must be a valid URL"),
  NEXTAUTH_SECRET: z
    .string()
    .min(32, "NEXTAUTH_SECRET must be at least 32 characters"),
  NEXTAUTH_URL_INTERNAL: z.string().url().optional(),

  // ── Application ─────────────────────────────────────────────────────────
  APP_NAME: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().optional(),

  // ── OAuth providers ─────────────────────────────────────────────────────
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_ENTRA_ID_CLIENT_ID: z.string().optional(),
  MICROSOFT_ENTRA_ID_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_ENTRA_ID_ISSUER: z.string().url().optional(),

  // ── Email ───────────────────────────────────────────────────────────────
  RESEND_API_KEY: z.string().optional(),
  /**
   * Generic fallback sender — used only when a specific sender is not set.
   * In production all three typed senders below must be configured.
   */
  EMAIL_FROM: z.string().optional(),
  /** Security emails: magic links, OTP codes, step-up verification, account linking. */
  EMAIL_FROM_SECURITY: z.string().optional(),
  /** Notification emails: workspace invites, approval assignments, platform-admin invites. */
  EMAIL_FROM_NOTIFICATIONS: z.string().optional(),
  /** Support emails: support tickets, billing notifications, sales inquiries. */
  EMAIL_FROM_SUPPORT: z.string().optional(),

  // ── Storage (R2) ────────────────────────────────────────────────────────
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET_NAME: z.string().optional(),
  NEXT_PUBLIC_R2_BUCKET_URL: z.string().url().optional(),

  // ── Billing (Paddle) ────────────────────────────────────────────────────
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  PADDLE_WEBHOOK_SECRET_CURRENT: z.string().optional(),
  PADDLE_WEBHOOK_SECRET_PREVIOUS: z.string().optional(),
  PADDLE_ENVIRONMENT: z.enum(["sandbox", "production"]).optional(),
  PADDLE_GRACE_DAYS: z.coerce.number().int().positive().optional(),
  PADDLE_PRICE_ID_STARTER: z.string().optional(),
  PADDLE_PRICE_ID_PRO: z.string().optional(),
  PADDLE_PRICE_ID_SCALE: z.string().optional(),
  PADDLE_PRICE_ID_STARTER_ANNUAL: z.string().optional(),
  PADDLE_PRICE_ID_PRO_ANNUAL: z.string().optional(),
  PADDLE_PRICE_ID_SCALE_ANNUAL: z.string().optional(),

  // ── Platform admin ──────────────────────────────────────────────────────
  BOOTSTRAP_ADMIN_EMAIL: z.string().optional(),
  /** Single address for sales inquiries from public /help/new (notifications). */
  PLATFORM_ADMIN_EMAIL: z.string().email().optional(),
  PLATFORM_ADMIN_EMAILS: z.string().optional(),
  BILLING_WEBHOOK_ACTOR_USER_ID: z.string().optional(),

  // ── Internal / Cron ─────────────────────────────────────────────────────
  CRON_SECRET: z.string().optional(),
  BILLING_PERIOD_CLOSE_SECRET: z.string().optional(),

  // ── AI (Help & Support KB search) ────────────────────────────────────────
  AI_PROVIDER: z.enum(["openai", "anthropic"]).optional(),
  AI_API_KEY: z.string().optional(),
  AI_MODEL: z.string().optional(),
  AI_MAX_TOKENS: z.coerce.number().int().positive().max(8192).optional(),
  /** OpenAI embeddings model (semantic search). Same AI_API_KEY as chat. */
  EMBEDDING_MODEL: z.string().optional().default("text-embedding-3-large"),
  EMBEDDING_DIMENSIONS: z.coerce.number().int().positive().optional().default(1536),
  /**
   * Cosine-similarity floor for pgvector retrieval (0–1). Recommended default `0.40`
   * for `text-embedding-3-large` at 1536 dimensions.
   */
  KB_SEARCH_SIMILARITY_THRESHOLD: z.coerce.number().min(0).max(1).optional().default(0.4),

  // ── WebAuthn ────────────────────────────────────────────────────────────
  WEBAUTHN_RP_NAME: z.string().optional(),

  // ── Public Paddle (referenced in server context) ─────────────────────────
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().optional(),
});

// Parse and validate at module load time — fails fast if required vars are missing
const _parsed = envSchema.safeParse(process.env);

if (!_parsed.success) {
  // Only throw during actual runtime, not during Vercel build phase
  const isBuildPhase =
    process.env.NEXT_PHASE === "phase-production-build" ||
    process.env.NEXT_PHASE === "phase-development-build" ||
    process.env.SKIP_ENV_VALIDATION === "true";

  if (!isBuildPhase) {
    const formatted = _parsed.error.issues
      .map((i) => `  - ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(
      `Invalid or missing environment variables:\n${formatted}\n\nCheck your .env.local file or deployment environment settings.`
    );
  }
}

// Export typed env — falls back to empty object during build phase (safe, never used)
export const env = (_parsed.success ? _parsed.data : {}) as z.infer<typeof envSchema>;

/**
 * @deprecated Use `env.VARIABLE_NAME` instead.
 * Kept for backward compatibility during migration — will be removed.
 */
export function getRequiredEnv(
  key: keyof Pick<
    z.infer<typeof envSchema>,
    "DATABASE_URL" | "DATABASE_DIRECT_URL" | "NEXTAUTH_URL" | "NEXTAUTH_SECRET"
  >
): string {
  const value = env[key];
  if (!value) throw new Error(`Required environment variable ${key} is not set`);
  return value;
}

/**
 * @deprecated Use `env.VARIABLE_NAME` instead.
 * Kept for backward compatibility during migration — will be removed.
 */
export function getOptionalEnv(key: keyof z.infer<typeof envSchema>): string | undefined {
  const value = env[key];
  return typeof value === "string" ? value : undefined;
}

/** @deprecated Use `env` directly — validation now happens at module load. */
export function validateEnv(): void {
  // No-op: validation now happens automatically when this module is imported.
  // Kept for backward compatibility with src/server/db.ts caller.
}
