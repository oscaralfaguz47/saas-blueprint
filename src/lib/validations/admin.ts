import { z } from "zod";

/** GET /api/admin/users/search — q and limit for combobox. */
export const adminUsersSearchQuerySchema = z.object({
  q: z.string().min(2).max(120),
  limit: z.coerce.number().int().min(1).max(20).default(10),
  platformAdminsOnly: z.coerce.boolean().optional().default(false),
});

/** GET /api/admin/workspaces — cursor pagination and filters. */
export const adminWorkspacesListQuerySchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(25),
  q: z.string().max(200).optional(),
  status: z.enum(["ACTIVE", "DRAFT", "SUSPENDED", "CLOSED"]).optional(),
  userIds: z
    .string()
    .optional()
    .transform((s) =>
      s ? s.split(",").map((id) => id.trim()).filter(Boolean).slice(0, 10) : undefined
    ),
  plan: z.enum(["free", "starter", "pro", "scale"]).optional(),
});

/** POST /api/admin/workspaces/:tenantId/break-glass/reset-primary-owner-2fa body. */
export const adminBreakGlassReset2FABodySchema = z.object({
  confirm: z.literal("RESET 2FA"),
});

export type AdminUsersSearchQuery = z.infer<typeof adminUsersSearchQuerySchema>;
export type AdminWorkspacesListQuery = z.infer<typeof adminWorkspacesListQuerySchema>;
export type AdminBreakGlassReset2FABody = z.infer<typeof adminBreakGlassReset2FABodySchema>;

export const vendorInviteBodySchema = z.object({
  email: z.string().email().max(191).transform((s) => s.trim().toLowerCase()),
  roleName: z.enum(["PlatformAdmin", "SupportAdmin", "BillingOps", "ReadOnlySupport"]),
});

export const revokeVendorInvitationBodySchema = z.object({
  invitationId: z.string().cuid(),
});

export const vendorInvitationAcceptBodySchema = z.object({
  token: z.string().min(1),
});

export type VendorInviteBody = z.infer<typeof vendorInviteBodySchema>;
export type RevokeVendorInvitationBody = z.infer<typeof revokeVendorInvitationBodySchema>;
export type VendorInvitationAcceptBody = z.infer<typeof vendorInvitationAcceptBodySchema>;
