import { prisma } from "@/server/db";
import { hasTenantPermission } from "./tenant-authorization";

/**
 * Validates request-level access rules.
 * 
 * A user can access a request if any of the following are true:
 * 1. They are the creator
 * 2. They are an explicit internal participant (e.g. assigned approver by email)
 * 3. The request visibility is WORKSPACE
 * 4. They have the "tenant.requests.read_all" permission
 * 
 * @returns boolean indication of access
 */
export async function canAccessRequest({
  tenantId,
  userId,
  requestId,
}: {
  tenantId: string;
  userId: string;
  requestId: string;
}): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) return false;

  const record = await prisma.record.findUnique({
    where: { id: requestId, tenantId },
    select: {
      createdByUserId: true,
      visibility: true,
      approvalRequests: {
        select: { id: true },
        where: { approverEmail: user.email },
      },
    },
  });

  if (!record) return false;

  // 1. Creator
  if (record.createdByUserId === userId) return true;

  // 2. Internal participant (approver by email)
  if (record.approvalRequests.length > 0) return true;

  // 3. Workspace visibility
  if (record.visibility === "WORKSPACE") return true;

  // 4. read_all permission fallback
  const canReadAll = await hasTenantPermission({
    userId,
    tenantId,
    permission: "tenant.requests.read_all",
  });
  
  if (canReadAll) return true;

  return false;
}
