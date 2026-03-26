import "server-only";

import { hasTenantPermission } from "@/server/security/tenant-authorization";

export async function canUserReplyToSupportTicket(params: {
  userId: string;
  tenantId: string;
  requesterUserId: string;
}): Promise<boolean> {
  const { userId, tenantId, requesterUserId } = params;

  // reply_workspace implies the user can reply to any ticket
  // including their own — check it first
  const hasWorkspace = await hasTenantPermission({
    userId,
    tenantId,
    permission: "support.ticket.reply_workspace",
  });
  if (hasWorkspace) return true;

  // reply_own allows replying only to tickets the user created
  if (requesterUserId === userId) {
    return hasTenantPermission({
      userId,
      tenantId,
      permission: "support.ticket.reply_own",
    });
  }

  return false;
}
