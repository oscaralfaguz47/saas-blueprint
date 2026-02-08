import { z } from "zod";
import { cuidSchema } from "./common";

/** Max length for tenant name (aligns with typical display limits) */
const TENANT_NAME_MAX = 160;

/** Max length for tenant slug (DB VarChar(80)) */
const TENANT_SLUG_MAX = 80;

/**
 * Normalize tenant name to a URL-safe slug.
 * Lowercase, spaces to hyphen, strip non-alphanumeric. No random suffix.
 * Used for validation and by create-tenant flow.
 */
export function slugFromTenantName(name: string): string {
  const slug = name
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/^-+|-+$/g, "")
    .slice(0, TENANT_SLUG_MAX);
  return slug || "workspace";
}

/**
 * Tenant (workspace) creation schema.
 * Slug is generated server-side from name; name is validated here.
 */
export const createTenantSchema = z
  .object({
    name: z
      .string()
      .min(1, "Workspace name is required")
      .max(TENANT_NAME_MAX, `Workspace name must be ${TENANT_NAME_MAX} characters or less`)
      .trim(),
  })
  .refine(
    (data) => {
      const slug = slugFromTenantName(data.name);
      return slug.length >= 1 && slug.length <= TENANT_SLUG_MAX;
    },
    { message: "Workspace name would produce an invalid URL slug" }
  );

/** Set default workspace (tenant) for the current user */
export const setDefaultTenantSchema = z.object({
  tenantId: cuidSchema,
});
