import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { deleteUserDraftTenants } from "@/server/services/tenancy-bootstrap";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

function getIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}

/** POST /api/tenant/invitations/[id]/accept — A5: in-app accept by invitation id (authenticated) */
export const POST = withErrorHandler(async (
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const { id: invitationId } = await params;
  if (!invitationId?.trim()) return ApiErrors.VALIDATION_ERROR("Invitation id is required");

  const invite = await prisma.tenantInvitation.findUnique({
    where: { id: invitationId },
    select: {
      id: true,
      tenantId: true,
      email: true,
      status: true,
      acceptedAt: true,
      revokedAt: true,
      expiresAt: true,
      role: true,
    },
  });

  if (!invite) return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();
  if (invite.status !== "PENDING") return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();
  if (invite.revokedAt || invite.acceptedAt) return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();
  const now = new Date();
  if (invite.expiresAt <= now) return ApiErrors.INVITATION_REVOKED_OR_EXPIRED();

  const userEmail = (session.user.email ?? "").toLowerCase();
  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    return ApiErrors.VALIDATION_ERROR(
      "This invitation was issued for a different email address",
      {
        expectedEmail: invite.email,
        currentEmail: userEmail || null,
        code: "INVITE_EMAIL_MISMATCH",
      }
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const existingMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
    select: { id: true, status: true },
  });

  if (existingMembership?.status === "ACTIVE") {
    await prisma.$transaction([
      prisma.tenantMembership.updateMany({
        where: { userId: user.id },
        data: { isDefaultTenant: false },
      }),
      prisma.tenantMembership.update({
        where: { id: existingMembership.id },
        data: { isDefaultTenant: true },
      }),
    ]);
    await deleteUserDraftTenants({
      userId: user.id,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req),
    });
    return apiSuccess({
      ok: true,
      alreadyMember: true,
      invitationId: invite.id,
      tenantId: invite.tenantId,
      membershipId: existingMembership.id,
    });
  }

  let result: { membershipId: string; membershipCreated: boolean; reenabled: boolean };
  try {
    result = await prisma.$transaction(async (tx) => {
      const updated = await tx.tenantInvitation.updateMany({
        where: {
          id: invite.id,
          status: "PENDING",
          acceptedAt: null,
          revokedAt: null,
          expiresAt: { gt: new Date() },
        },
        data: { acceptedAt: new Date(), status: "ACCEPTED" },
      });
      if (updated.count !== 1) throw new Error("INVITATION_CONSUMED_OR_INVALID");

      if (existingMembership?.status === "DISABLED") {
        await tx.tenantMembership.update({
          where: { id: existingMembership.id },
          data: { status: "ACTIVE" },
        });
        return {
          membershipId: existingMembership.id,
          membershipCreated: false,
          reenabled: true,
        };
      }

      const membership = await tx.tenantMembership.create({
        data: {
          tenantId: invite.tenantId,
          userId: user.id,
          status: "ACTIVE",
          joinedAt: new Date(),
          isDefaultTenant: false,
        },
        select: { id: true },
      });

      const assignedRoleName = invite.role ?? "Member";
      const foundRole = await tx.tenantRole.findUnique({
        where: {
          tenantId_name: { tenantId: invite.tenantId, name: assignedRoleName },
        },
        select: { id: true },
      });
      const role =
        foundRole ??
        (await tx.tenantRole.create({
          data: {
            tenantId: invite.tenantId,
            name: assignedRoleName,
            isSystem: assignedRoleName === "Member",
          },
          select: { id: true },
        }));

      await tx.tenantUserRole.create({
        data: { membershipId: membership.id, roleId: role.id },
      });

      return {
        membershipId: membership.id,
        membershipCreated: true,
        reenabled: false,
      };
    });
  } catch (err) {
    if (err instanceof Error && err.message === "INVITATION_CONSUMED_OR_INVALID") {
      return ApiErrors.NOT_FOUND("Invitation not found or expired");
    }
    throw err;
  }

  await prisma.$transaction([
    prisma.tenantMembership.updateMany({
      where: { userId: user.id },
      data: { isDefaultTenant: false },
    }),
    prisma.tenantMembership.update({
      where: { id: result.membershipId },
      data: { isDefaultTenant: true },
    }),
  ]);

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: invite.tenantId,
    action: "tenant.invite.accepted",
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: {
      invitedEmail: invite.email,
      membershipCreated: result.membershipCreated,
      membershipId: result.membershipId,
      reenabled: result.reenabled,
      role: invite.role ?? "Member",
    },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  await deleteUserDraftTenants({
    userId: session.user.id,
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  if (result.reenabled) {
    await writeAuditLog({
      actorUserId: session.user.id,
      actorContext: "TENANT",
      tenantId: invite.tenantId,
      action: "tenant.user.reenabled",
      targetType: "TenantMembership",
      targetId: result.membershipId,
      metadata: { invitedEmail: invite.email },
      ipAddress: getIp(req),
      userAgent: getUserAgent(req),
    });
  }

  return apiSuccess({
    ok: true,
    invitationId: invite.id,
    tenantId: invite.tenantId,
    membershipCreated: result.membershipCreated,
    membershipId: result.membershipId,
    alreadyMember: false,
  });
});
