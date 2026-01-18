import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import crypto from "crypto";

type AcceptBody = { token: string };

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const body = (await req.json().catch(() => null)) as AcceptBody | null;
  const token = body?.token?.trim() ?? "";

  if (!token || token.length < 20) {
    return NextResponse.json({ error: "INVALID_TOKEN" }, { status: 400 });
  }

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
    return NextResponse.json({ error: "INVITE_NOT_FOUND_OR_EXPIRED" }, { status: 404 });
  }

  // Ensure invitation email matches the logged-in user email (critical security)
  const userEmail = (session.user.email ?? "").toLowerCase();
if (!userEmail || userEmail !== invite.email.toLowerCase()) {
  return NextResponse.json(
    {
      error: "EMAIL_MISMATCH",
      message: "This invitation was issued for a different email address.",
      expectedEmail: invite.email,
      currentEmail: userEmail || null,
      nextAction: "SIGN_OUT_AND_SIGN_IN_WITH_EXPECTED_EMAIL",
    },
    { status: 403 }
  );
}


  // Ensure user exists in DB (should, because they are logged in)
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });

  if (!user) {
    return NextResponse.json({ error: "USER_NOT_FOUND" }, { status: 404 });
  }

  // If already a member, mark invitation accepted (idempotent-ish) and return
  const existingMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: invite.tenantId, userId: user.id } },
    select: { id: true, status: true },
  });

  // Transaction: mark accepted + create membership + assign default role
  const result = await prisma.$transaction(async (tx) => {
    // Mark invitation accepted (if already accepted by race condition, will throw)
    const updatedInvite = await tx.tenantInvitation.update({
      where: { id: invite.id },
      data: { acceptedAt: new Date() },
      select: { id: true, tenantId: true, email: true, acceptedAt: true },
    });

    if (existingMembership) {
      return { invite: updatedInvite, membershipCreated: false, membershipId: existingMembership.id };
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
      select: { id: true, tenantId: true, userId: true, status: true },
    });

    // Assign default role to invited user: Viewer
    const viewerRole = await tx.tenantRole.findUnique({
      where: { tenantId_name: { tenantId: invite.tenantId, name: "Viewer" } },
      select: { id: true },
    });

    if (viewerRole) {
      await tx.tenantUserRole.create({
        data: { membershipId: membership.id, roleId: viewerRole.id },
      });
    }

    return { invite: updatedInvite, membershipCreated: true, membershipId: membership.id };
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

  return NextResponse.json({
    ok: true,
    invitationId: invite.id,
    tenantId: invite.tenantId,
    membershipCreated: result.membershipCreated,
    membershipId: result.membershipId,
  });
}

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function getIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}
