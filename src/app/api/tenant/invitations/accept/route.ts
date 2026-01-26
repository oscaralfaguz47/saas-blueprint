import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, acceptInvitationSchema } from "@/lib/validations";
import crypto from "crypto";

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const body = await parseBody(req, acceptInvitationSchema);
  const token = body.token;

  const tokenHash = sha256(token);

  // Find active invitation (not accepted, not expired)
  const invite = await prisma.tenantInvitation.findFirst({
    where: {
      tokenHash,
      acceptedAt: null,
      expiresAt: { gt: new Date() },
    },
    select: {
      id: true,
      tenantId: true,
      email: true,
      expiresAt: true,
      invitedByUserId: true,
    },
  });

  if (!invite) {
    return ApiErrors.NOT_FOUND("Invitation not found or expired");
  }

  // Ensure invitation email matches the logged-in user email (critical security)
  const userEmail = (session.user.email ?? "").toLowerCase();
  if (!userEmail || userEmail !== invite.email.toLowerCase()) {
    return ApiErrors.VALIDATION_ERROR(
      "This invitation was issued for a different email address",
      {
        expectedEmail: invite.email,
        currentEmail: userEmail || null,
        nextAction: "SIGN_OUT_AND_SIGN_IN_WITH_EXPECTED_EMAIL",
      }
    );
  }

  // Ensure user exists in DB (should, because they are logged in)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });

  if (!user) {
    return ApiErrors.NOT_FOUND("User");
  }

  // Transaction: mark accepted + create membership + assign default role
  const result = await prisma.$transaction(async (tx) => {
    // Check membership INSIDE transaction (race-safe)
   const existingMembership = await tx.tenantMembership.findUnique({
  where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
  select: { id: true, status: true },
});


    // Mark invitation accepted
    const updatedInvite = await tx.tenantInvitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
      select: { id: true, tenantId: true, email: true, acceptedAt: true },
    });

    if (existingMembership) {
      return {
        invite: updatedInvite,
        membershipCreated: false,
        membershipId: existingMembership.id,
      };
    }

    // Create membership
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

    // Try to find system "Member" role
    const memberRole = await tx.tenantRole.findUnique({
      where: {
        tenantId_name: {
          tenantId: invite.tenantId,
          name: "Member",
        },
      },
      select: { id: true },
    });

    const role =
      memberRole ??
      (await tx.tenantRole.create({
        data: {
          tenantId: invite.tenantId,
          name: "Member",
          isSystem: true,
        },
        select: { id: true },
      }));

    // Assign role
    await tx.tenantUserRole.create({
      data: {
        membershipId: membership.id,
        roleId: role.id,
      },
    });

    return {
      invite: updatedInvite,
      membershipCreated: true,
      membershipId: membership.id,
    };
  });


  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: invite.tenantId,
    action: "tenant.invitation.accept",
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: {
      invitedEmail: invite.email,
      membershipCreated: result.membershipCreated,
      membershipId: result.membershipId,
    },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  return apiSuccess({
    ok: true,
    invitationId: invite.id,
    tenantId: invite.tenantId,
    membershipCreated: result.membershipCreated,
    membershipId: result.membershipId,
  });
});

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function getIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}
