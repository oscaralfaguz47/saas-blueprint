import "server-only";

import { prisma } from "@/server/db";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { hasVendorPermission } from "@/server/security/vendor-authorization";
import type { RoleKey } from "@/types/next-auth";

export type CanAccessSupportTicketParams = {
  tenantId: string;
  userId: string;
  ticketId: string;
  legacyRole?: RoleKey;
  /** When true, allow platform admins with `admin.support.read`. */
  isVendorAdmin: boolean;
};

/**
 * Returns true if the user is allowed to read this ticket (same tenant, or vendor read).
 */
export async function canAccessSupportTicket(
  params: CanAccessSupportTicketParams
): Promise<boolean> {
  const { tenantId, userId, ticketId, legacyRole, isVendorAdmin } = params;

  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    select: { tenantId: true, requesterUserId: true },
  });
  if (!ticket) return false;

  if (isVendorAdmin) {
    return hasVendorPermission({
      userId,
      legacyRole,
      permission: "admin.support.read",
    });
  }

  if (!ticket.tenantId) return false;

  if (ticket.tenantId !== tenantId) return false;

  if (ticket.requesterUserId === userId) return true;

  return hasTenantPermission({
    userId,
    tenantId,
    permission: "support.ticket.read_workspace",
  });
}
