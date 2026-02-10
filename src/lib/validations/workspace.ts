import { z } from "zod";
import { cuidSchema } from "./common";

/** Max length for tenant slug (DB VarChar(80)) */
export const TENANT_SLUG_MAX = 80;

/** A5 claim: min 3, max 32 chars */
export const CLAIM_SLUG_MIN = 3;
export const CLAIM_SLUG_MAX = 32;

/** Reserved slugs (A5) — cannot be used as workspace URL */
export const RESERVED_SLUGS = new Set([
  "admin",
  "api",
  "app",
  "billing",
  "settings",
  "support",
  "www",
  "setup",
  "invite",
  "workspace",
  "requests",
]);

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

/**
 * Normalize input to a URL-safe slug: lowercase, hyphen-separated, alphanumeric only.
 * Used for validation and by create-tenant flow.
 */
export function normalizeSlug(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .replace(/-+/g, "-")
    .slice(0, TENANT_SLUG_MAX);
}

/**
 * Derive display name from slug (e.g. acme-inc → Acme Inc).
 */
export function nameFromSlug(slug: string): string {
  if (!slug) return "Workspace";
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

/** Slug-only workspace creation (modal flow). Name is derived server-side from slug. */
export const createTenantSchema = z.object({
  slug: z
    .string()
    .min(1, "Workspace URL is required")
    .max(TENANT_SLUG_MAX, `Workspace URL must be ${TENANT_SLUG_MAX} characters or less`)
    .transform(normalizeSlug)
    .refine((s) => s.length >= 1, "Workspace URL is required")
    .refine((s) => slugRegex.test(s), "Use only lowercase letters, numbers, and hyphens"),
});

/** Set default workspace (tenant) for the current user */
export const setDefaultTenantSchema = z.object({
  tenantId: cuidSchema,
});

/** A5 claim workspace: slug rules (min 3, max 32, no reserved) */
export const claimSlugSchema = z
  .string()
  .min(CLAIM_SLUG_MIN, `Workspace URL must be at least ${CLAIM_SLUG_MIN} characters`)
  .max(CLAIM_SLUG_MAX, `Workspace URL must be ${CLAIM_SLUG_MAX} characters or less`)
  .transform((s) => s.toLowerCase().trim())
  .refine((s) => s.length >= CLAIM_SLUG_MIN, "Workspace URL is too short")
  .refine((s) => slugRegex.test(s), "Use only lowercase letters, numbers, and hyphens (no leading/trailing/consecutive hyphens)")
  .refine((s) => !RESERVED_SLUGS.has(s), "This workspace URL is reserved");

/** A5 claim workspace request body */
export const claimWorkspaceSchema = z.object({
  slug: claimSlugSchema,
});

/** Workspace settings (editable in modal after create) */
export const workspaceSettingsSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  dateFormat: z.string().max(32).optional(),
  description: z.string().max(500).optional(),
});

/** Request upload URL: client declares intent (MIME, size). Server authorizes. */
export const logoUploadUrlSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentLength: z
    .number()
    .int()
    .min(1, { message: "File is empty or size could not be determined. Please choose a valid image file." })
    .max(2 * 1024 * 1024), // 2MB
  extension: z.enum(["png", "jpeg", "jpg", "webp"]),
});

/** Confirm upload: server verifies object exists and updates Tenant. */
export const logoConfirmSchema = z.object({
  objectKey: z.string().min(1).max(512),
});
