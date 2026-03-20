import { z } from "zod";
import { cuidSchema } from "./common";

/** Max length for tenant slug (DB VarChar(80)) */
export const TENANT_SLUG_MAX = 80;

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

/** Name-based workspace creation. Slug is auto-derived from name on the server. */
export const createTenantSchema = z.object({
  name: z
    .string()
    .min(2, "Workspace name must be at least 2 characters")
    .max(80, "Workspace name must be 80 characters or less")
    .transform((s) => s.trim()),
});

/** Set default workspace (tenant) for the current user */
export const setDefaultTenantSchema = z.object({
  tenantId: cuidSchema,
});

/** Workspace settings (editable in modal after create) */
export const workspaceSettingsSchema = z.object({
  name: z.string().min(1).max(80).trim().optional(),
  timezone: z.string().max(64).optional(),
  currency: z.string().length(3).optional(),
  dateFormat: z.string().max(32).optional(),
  description: z.string().max(500).optional(),
});

/** Request upload URL: client sends compressed image size/type (max 10MB). */
export const logoUploadUrlSchema = z.object({
  contentType: z.enum(["image/png", "image/jpeg", "image/webp"]),
  contentLength: z
    .number()
    .int()
    .min(1, { message: "File is empty or invalid." })
    .max(10 * 1024 * 1024), // 10MB max
  extension: z.enum(["png", "jpeg", "jpg", "webp"]),
});

/** Confirm upload: server verifies object exists and updates Tenant. */
export const logoConfirmSchema = z.object({
  objectKey: z.string().min(1).max(512),
});
