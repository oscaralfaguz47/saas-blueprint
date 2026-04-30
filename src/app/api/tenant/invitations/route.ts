import { getServerSession } from "next-auth";
import {
  BillingAccessLevel,
  FinanceResponsibility,
  FinancialAccessScope,
  WorkspaceRole,
  Prisma,
} from "@prisma/client";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { validate4AxisCombination } from "@/server/security/access-model";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";
import { sendInvitationEmail } from "@/server/services/invitation-email";
import { ApiErrors, apiError, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { getBaseUrlFromRequest } from "@/lib/request-utils";
import { parseBody, createInvitationSchema } from "@/lib/validations";
import crypto from "crypto";

const ROLE_RANK: Record<string, number> = {
  "Primary Owner": 5,
  Owner: 4,
  Admin: 3,
  Finance: 2,
  Member: 1,
};

const WORKSPACE_ROLE_RANK: Record<WorkspaceRole, number> = {
  OWNER: 3,
  ADMIN: 2,
  MEMBER: 1,
};

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

export const GET = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.users.read",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const invitations = await prisma.tenantInvitation.findMany({
    where: { tenantId: tenant.id },
    select: {
      id: true,
      email: true,
      createdAt: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      workspaceRole: true,
      financialAccess: true,
      financeResponsibility: true,
      billingAccess: true,
      invitedByUser: { select: { name: true, email: true } },
    },
    orderBy: [{ createdAt: "desc" }],
  });

  const now = new Date();
  const list = invitations.map((inv) => ({
    id: inv.id,
    email: inv.email,
    status: deriveInviteStatus(inv, now),
    invitedBy: inv.invitedByUser
      ? { name: inv.invitedByUser.name, email: inv.invitedByUser.email }
      : null,
    invitedAt: inv.createdAt,
    expiresAt: inv.expiresAt,
    workspaceRole: inv.workspaceRole,
    financialAccess: inv.financialAccess,
    financeResponsibility: inv.financeResponsibility,
    billingAccess: inv.billingAccess,
  }));

  return apiSuccess({ invitations: list });
});

function deriveInviteStatus(
  inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date },
  now: Date
): "ACTIVE" | "EXPIRED" | "REVOKED" | "ACCEPTED" {
  if (inv.acceptedAt) return "ACCEPTED";
  if (inv.revokedAt) return "REVOKED";
  if (inv.expiresAt <= now) return "EXPIRED";
  return "ACTIVE";
}

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenant = membership?.tenant;
  if (!tenant) return ApiErrors.NO_TENANT();

  const allowed = await hasTenantPermission({
    userId: session.user.id,
    tenantId: tenant.id,
    permission: "tenant.users.invite",
  });
  if (!allowed) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, createInvitationSchema);
  const requestedRole = body.role ?? "Member";

  const inviterMembership = await prisma.tenantMembership.findUnique({
    where: { tenantId_userId: { tenantId: tenant.id, userId: session.user.id } },
    select: {
      workspaceRole: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  const inviterRoleNames = inviterMembership?.roles.map((r) => r.role.name) ?? [];
  const inviterMaxRank = Math.max(0, ...inviterRoleNames.map((n) => ROLE_RANK[n] ?? 0));
  const requestedRank = ROLE_RANK[requestedRole] ?? 1;

  if (requestedRank >= inviterMaxRank) {
    return ApiErrors.FORBIDDEN();
  }

  if (!inviterMembership) {
    return ApiErrors.FORBIDDEN();
  }

  const requestedWorkspaceRole = body.workspaceRole ?? WorkspaceRole.MEMBER;
  const inviterWorkspaceRank = WORKSPACE_ROLE_RANK[inviterMembership.workspaceRole];
  const targetWorkspaceRank = WORKSPACE_ROLE_RANK[requestedWorkspaceRole];
  if (targetWorkspaceRank > inviterWorkspaceRank) {
    return apiError("FORBIDDEN", 403, "Cannot invite with a workspace role higher than your own.", {
      code: "WORKSPACE_ROLE_RANK_EXCEEDED",
    });
  }

  const axisProvided =
    body.workspaceRole !== undefined ||
    body.financialAccess !== undefined ||
    body.financeResponsibility !== undefined ||
    body.billingAccess !== undefined;

  if (axisProvided) {
    const mergedAxes = {
      workspaceRole: body.workspaceRole ?? WorkspaceRole.MEMBER,
      financialAccess: body.financialAccess ?? FinancialAccessScope.OWN_AND_PARTICIPATING,
      financeResponsibility: body.financeResponsibility ?? FinanceResponsibility.NONE,
      billingAccess: body.billingAccess ?? BillingAccessLevel.NONE,
    };
    const comboErr = validate4AxisCombination(mergedAxes);
    if (comboErr !== null) {
      return ApiErrors.VALIDATION_ERROR("Invalid access combination for this invitation.", {
        code: comboErr,
      });
    }
  }

  const emailNormalized = normalizeEmail(body.email);

  const existingUser = await prisma.user.findUnique({
    where: { email: emailNormalized },
    select: { id: true },
  });
  if (existingUser) {
    const existingMembership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId: tenant.id, userId: existingUser.id } },
      select: { id: true },
    });
    if (existingMembership) {
      return ApiErrors.VALIDATION_ERROR("User is already a member of this tenant");
    }
  }

  const now = new Date();
  const activeInvite = await prisma.tenantInvitation.findFirst({
    where: {
      tenantId: tenant.id,
      email: emailNormalized,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (activeInvite) {
    return ApiErrors.CONFLICT("An active invite already exists for this email.", {
      code: "ACTIVE_INVITE_EXISTS",
    });
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7); // 7 days

  const invite = await prisma.tenantInvitation.create({
    data: {
      tenantId: tenant.id,
      email: emailNormalized,
      tokenHash,
      expiresAt,
      invitedByUserId: session.user.id,
      role: requestedRole,
      ...(body.workspaceRole !== undefined && { workspaceRole: body.workspaceRole }),
      ...(body.financialAccess !== undefined && { financialAccess: body.financialAccess }),
      ...(body.financeResponsibility !== undefined && {
        financeResponsibility: body.financeResponsibility,
      }),
      ...(body.billingAccess !== undefined && { billingAccess: body.billingAccess }),
    },
    select: {
      id: true,
      email: true,
      expiresAt: true,
      acceptedAt: true,
      role: true,
      workspaceRole: true,
      financialAccess: true,
      financeResponsibility: true,
      billingAccess: true,
    },
  });

  const auditMetadata: Prisma.InputJsonValue = axisProvided
    ? {
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
        sendEmail: body.sendEmail,
        role: requestedRole,
        axes: {
          workspaceRole: invite.workspaceRole,
          financialAccess: invite.financialAccess,
          financeResponsibility: invite.financeResponsibility,
          billingAccess: invite.billingAccess,
        },
        axesExplicit: {
          workspaceRole: body.workspaceRole !== undefined,
          financialAccess: body.financialAccess !== undefined,
          financeResponsibility: body.financeResponsibility !== undefined,
          billingAccess: body.billingAccess !== undefined,
        },
      }
    : {
        email: invite.email,
        expiresAt: invite.expiresAt.toISOString(),
        sendEmail: body.sendEmail,
        role: requestedRole,
      };

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: tenant.id,
    action: "tenant.user.invited",
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: auditMetadata,
    ipAddress: getIp(req),
    userAgent: getUserAgent(req),
  });

  const baseUrl = getBaseUrlFromRequest(req);
  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(rawToken)}`;

  if (body.sendEmail !== false) {
    await sendInvitationEmail({
      tenantName: tenant.name,
      invitedEmail: invite.email,
      rawToken,
      baseUrl,
      role: requestedRole,
    });
  }

  return apiSuccess({
    invitation: {
      id: invite.id,
      email: invite.email,
      expiresAt: invite.expiresAt,
    },
    inviteUrl,
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
