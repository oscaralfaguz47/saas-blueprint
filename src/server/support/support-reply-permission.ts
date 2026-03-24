import "server-only";

import { hasTenantPermission } from "@/server/security/tenant-authorization";

export async function canUserReplyToSupportTicket(params: {
  userId: string;
  tenantId: string;
  requesterUserId: string;
}): Promise<boolean> {
  const { userId, tenantId, requesterUserId } = params;
  if (requesterUserId === userId) {
    return hasTenantPermission({
      userId,
      tenantId,
      permission: "support.ticket.reply_own",
    });
  }
  return hasTenantPermission({
    userId,
    tenantId,
    permission: "support.ticket.reply_workspace",
  });
}
