import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/audit";
import crypto from "crypto";

type InviteBody = {
  email: string;
};

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });
  }

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) {
    return NextResponse.json({ error: "NO_TENANT" }, { status: 403 });
  }

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.users.invite",
  });

  if (!allowed) {
    return NextResponse.json({ error: "FORBIDDEN" }, { status: 403 });
  }

  const body = (await req.json().catch(() => null)) as InviteBody | null;
const emailRaw = body?.email?.trim() ?? "";
  const email = emailRaw.toLowerCase();

  if (!email || !isValidEmail(email)) {
    return NextResponse.json({ error: "INVALID_EMAIL" }, { status: 400 });
  }

  // If user already belongs to tenant, don't invite.
  const existingUser = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existingUser) {
    const existingMembership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: existingUser.id } },
      select: { id: true },
    });

    if (existingMembership) {
      return NextResponse.json(
        { error: "ALREADY_MEMBER" },
        { status: 409 }
      );
    }
  }

  // Create invitation token (store only hash)
  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);

  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  const invite = await prisma.tenantInvitation.create({
    data: {
      tenantId: tenant.id,
      email,
      tokenHash,
      expiresAt,
      invitedByUserId: session.user.id,
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      acceptedAt: true,
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "tenant.invitation.create",
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { email, expiresAt: invite.expiresAt.toISOString() },
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  // For now we return a token only for local/dev testing.
  // In production you'd email a link like:
  //   https://app.com/invite?token=<rawToken>
  // and you NEVER store the raw token in DB.
  return NextResponse.json({
    invitation: invite,
    dev: {
      token: rawToken,
      // e.g. /invite?token=<token> (you'll implement acceptance next)
    },
  });
}

function sha256(v: string): string {

  return crypto.createHash("sha256").update(v).digest("hex");
}

function isValidEmail(email: string): boolean {

  // Simple validation; can be replaced later.
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function getIp(req: Request): string | null {

  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {

  return req.headers.get("user-agent") ?? null;
}
