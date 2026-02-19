import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { writeAuditLog } from "@/server/services/audit";
import {
  getHighestRoleName,
  getRoleRank,
  canManageTargetByRole,
  onlyPrimaryOwnerCanChangeOwnerLevel,
  isOwnerLevel,
} from "@/server/security/authority";
import { getOwnerLevelCount } from "@/server/security/member-security-governance";
import { sendInvitationEmail } from "@/server/services/invitation-email";
import { getBaseUrlFromRequest } from "@/lib/request-utils";
import crypto from "crypto";

export type ActorContext = "TENANT" | "VENDOR";

export type AuditMeta = {
  ipAddress: string | null;
  userAgent: string | null;
};

function sha256(v: string): string {
  return crypto.createHash("sha256").update(v).digest("hex");
}

function normalizeEmail(email: string): string {
  return email.toLowerCase().trim();
}

/** Transfer primary ownership. When actorContext is VENDOR, actor is not required to be current primary owner. */
export async function executeTransferPrimaryOwner(params: {
  tenantId: string;
  newPrimaryOwnerUserId: string;
  actorUserId: string;
  actorContext: ActorContext;
  auditMeta: AuditMeta;
}): Promise<
  | { ok: true }
  | { error: "NOT_FOUND"; message: string }
  | { error: "VALIDATION"; message: string; code?: string }
> {
  const { tenantId, newPrimaryOwnerUserId, actorUserId, actorContext, auditMeta } = params;

  const [tenant, currentPrimaryMembership, targetMembership, primaryOwnerRole, ownerRole] =
    await Promise.all([
      prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { id: true },
      }),
      prisma.tenantMembership.findFirst({
        where: {
          tenantId,
          roles: {
            some: { role: { name: "Primary Owner" } },
          },
        },
        select: {
          id: true,
          userId: true,
          status: true,
          roles: { select: { role: { select: { name: true, id: true } } } },
        },
      }),
      prisma.tenantMembership.findUnique({
        where: { tenantId_userId: { tenantId, userId: newPrimaryOwnerUserId } },
        select: {
          id: true,
          userId: true,
          status: true,
          roles: { select: { role: { select: { name: true, id: true } } } },
        },
      }),
      prisma.tenantRole.findUnique({
        where: { tenantId_name: { tenantId, name: "Primary Owner" } },
        select: { id: true },
      }),
      prisma.tenantRole.findUnique({
        where: { tenantId_name: { tenantId, name: "Owner" } },
        select: { id: true },
      }),
    ]);

  if (!tenant || !primaryOwnerRole || !ownerRole)
    return { error: "NOT_FOUND", message: "Workspace or role not found" };
  if (!currentPrimaryMembership)
    return { error: "NOT_FOUND", message: "Primary owner membership not found" };
  if (!targetMembership) return { error: "NOT_FOUND", message: "Member not found" };

  if (targetMembership.status !== "ACTIVE")
    return { error: "VALIDATION", message: "Target user is no longer active.", code: "TARGET_NOT_ACTIVE" };

  if (actorContext === "TENANT" && currentPrimaryMembership.userId !== actorUserId)
    return { error: "VALIDATION", message: "Only the primary owner can transfer ownership." };

  if (targetMembership.userId === currentPrimaryMembership.userId)
    return { error: "VALIDATION", message: "You are already the primary owner." };

  const targetRoleNames = targetMembership.roles.map((r) => r.role.name);
  const targetIsEligible =
    targetRoleNames.includes("Owner") || targetRoleNames.includes("Admin");
  if (!targetIsEligible)
    return {
      error: "VALIDATION",
      message: "New primary owner must have the Owner or Admin role.",
      code: "TARGET_MUST_BE_OWNER_OR_ADMIN",
    };

  if (targetRoleNames.includes("Primary Owner")) return { ok: true };

  const currentPrimaryOwnerMembershipId = currentPrimaryMembership.id;
  const newPrimaryOwnerMembershipId = targetMembership.id;

  try {
    await prisma.$transaction(
      async (tx) => {
        const [lockedActor, lockedTarget, primaryRole, ownerRoleTx] = await Promise.all([
          tx.tenantMembership.findUnique({
            where: { id: currentPrimaryOwnerMembershipId },
            select: {
              id: true,
              userId: true,
              status: true,
              roles: { select: { role: { select: { name: true, id: true } } } },
            },
          }),
          tx.tenantMembership.findUnique({
            where: { id: newPrimaryOwnerMembershipId },
            select: {
              id: true,
              userId: true,
              status: true,
              roles: { select: { role: { select: { name: true, id: true } } } },
            },
          }),
          tx.tenantRole.findUnique({
            where: { tenantId_name: { tenantId, name: "Primary Owner" } },
            select: { id: true },
          }),
          tx.tenantRole.findUnique({
            where: { tenantId_name: { tenantId, name: "Owner" } },
            select: { id: true },
          }),
        ]);

        if (!lockedActor || !lockedTarget || !primaryRole || !ownerRoleTx)
          throw new Error("TRANSFER_VALIDATION");
        const stillPrimaryOwner = lockedActor.roles.some((r) => r.role.name === "Primary Owner");
        if (!stillPrimaryOwner) throw new Error("PRIMARY_OWNER_CHANGED");
        if (lockedTarget.status !== "ACTIVE") throw new Error("TARGET_NOT_ACTIVE");

        await tx.tenantUserRole.deleteMany({
          where: { membershipId: currentPrimaryOwnerMembershipId, roleId: primaryRole.id },
        });
        await tx.tenantUserRole.upsert({
          where: {
            membershipId_roleId: {
              membershipId: newPrimaryOwnerMembershipId,
              roleId: primaryRole.id,
            },
          },
          create: { membershipId: newPrimaryOwnerMembershipId, roleId: primaryRole.id },
          update: {},
        });
        await tx.tenantUserRole.upsert({
          where: {
            membershipId_roleId: {
              membershipId: currentPrimaryOwnerMembershipId,
              roleId: ownerRoleTx.id,
            },
          },
          create: { membershipId: currentPrimaryOwnerMembershipId, roleId: ownerRoleTx.id },
          update: {},
        });

        const primaryOwnerCount = await tx.tenantUserRole.count({
          where: {
            roleId: primaryRole.id,
            membership: { tenantId, status: "ACTIVE" },
          },
        });
        if (primaryOwnerCount !== 1) throw new Error("INVARIANT_VIOLATION");
        const ownerRoleIds = [primaryRole.id, ownerRoleTx.id];
        const ownerLevelCount = await tx.tenantUserRole.count({
          where: {
            roleId: { in: ownerRoleIds },
            membership: { tenantId, status: "ACTIVE" },
          },
        });
        if (ownerLevelCount < 1) throw new Error("INVARIANT_VIOLATION");

        const action =
          actorContext === "VENDOR"
            ? "admin.workspace.primary_owner.transferred"
            : "tenant.membership.primary_owner_transferred";
        await writeAuditLog({
          actorUserId,
          actorContext: actorContext === "VENDOR" ? "VENDOR" : "TENANT",
          tenantId,
          action,
          targetType: "TenantMembership",
          targetId: lockedTarget.id,
          targetUserId: newPrimaryOwnerUserId,
          metadata: {
            oldPrimaryOwnerId: currentPrimaryMembership.userId,
            newPrimaryOwnerId: newPrimaryOwnerUserId,
          },
          ...auditMeta,
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable }
    );
  } catch (err) {
    if (err instanceof Error) {
      if (err.message === "PRIMARY_OWNER_CHANGED")
        return { error: "VALIDATION", message: "Primary Owner has changed during this operation.", code: "PRIMARY_OWNER_CHANGED" };
      if (err.message === "TARGET_NOT_ACTIVE")
        return { error: "VALIDATION", message: "Target user is no longer active.", code: "TARGET_NOT_ACTIVE" };
      if (err.message === "INVARIANT_VIOLATION" || err.message === "TRANSFER_VALIDATION")
        return { error: "VALIDATION", message: "Transfer could not be completed.", code: "TRANSFER_FAILED" };
    }
    throw err;
  }
  return { ok: true };
}

/** Change member role by membership id. When VENDOR, hierarchy checks are skipped; invariants still enforced. */
export async function executeChangeMemberRole(params: {
  tenantId: string;
  targetMembershipId: string;
  newRole: "Owner" | "Admin" | "Finance" | "Member";
  actorUserId: string;
  actorContext: ActorContext;
  auditMeta: AuditMeta;
}): Promise<
  | { ok: true }
  | { error: "NOT_FOUND"; message: string }
  | { error: "VALIDATION"; message: string; code?: string }
> {
  const { tenantId, targetMembershipId, newRole, actorUserId, actorContext, auditMeta } = params;

  const [targetMembership, roles] = await Promise.all([
    prisma.tenantMembership.findFirst({
      where: { id: targetMembershipId, tenantId },
      select: {
        id: true,
        userId: true,
        roles: { select: { roleId: true, role: { select: { name: true } } } },
      },
    }),
    prisma.tenantRole.findMany({
      where: { tenantId, name: { in: ["Owner", "Admin", "Finance", "Member"] } },
      select: { id: true, name: true },
    }),
  ]);

  if (!targetMembership) return { error: "NOT_FOUND", message: "Member not found" };

  const currentTargetRole = getHighestRoleName(targetMembership.roles.map((r) => r.role.name)) ?? "Member";
  if (currentTargetRole === "Primary Owner")
    return {
      error: "VALIDATION",
      message: "Use transfer primary ownership to change the primary owner.",
      code: "USE_TRANSFER_PRIMARY_OWNERSHIP",
    };

  if (actorContext === "TENANT") {
    const actorMembership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: actorUserId } },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    if (!actorMembership) return { error: "NOT_FOUND", message: "Member not found" };
    const actorRole = getHighestRoleName(actorMembership.roles.map((r) => r.role.name)) ?? "Member";
    const isOwnerLevelChange = newRole === "Owner" || isOwnerLevel(currentTargetRole);
    if (isOwnerLevelChange && !onlyPrimaryOwnerCanChangeOwnerLevel(actorRole))
      return { error: "VALIDATION", message: "Only primary owner can change owner-level roles." };
    if (!canManageTargetByRole(actorRole, currentTargetRole))
      return { error: "VALIDATION", message: "Insufficient permissions." };
    if (getRoleRank(actorRole) <= getRoleRank(newRole))
      return { error: "VALIDATION", message: "Cannot assign role equal or higher than your own." };
    if (actorRole !== "Primary Owner") {
      const ownerLevelCount = await getOwnerLevelCount(tenantId);
      const targetHadOwnerLevel = isOwnerLevel(currentTargetRole);
      const ownerLevelAfter =
        ownerLevelCount - (targetHadOwnerLevel ? 1 : 0) + (newRole === "Owner" ? 1 : 0);
      if (ownerLevelAfter < 1)
        return { error: "VALIDATION", message: "At least one owner-level user must remain." };
    }
  } else {
    const ownerLevelCount = await getOwnerLevelCount(tenantId);
    const targetHadOwnerLevel = isOwnerLevel(currentTargetRole);
    const ownerLevelAfter =
      ownerLevelCount - (targetHadOwnerLevel ? 1 : 0) + (newRole === "Owner" ? 1 : 0);
    if (ownerLevelAfter < 1)
      return { error: "VALIDATION", message: "At least one owner-level user must remain." };
  }

  const roleIdByName = new Map(roles.map((r) => [r.name, r.id]));
  const newRoleId = roleIdByName.get(newRole);
  if (!newRoleId) return { error: "VALIDATION", message: "Invalid role." };

  await prisma.$transaction(async (tx) => {
    await tx.tenantUserRole.deleteMany({ where: { membershipId: targetMembership.id } });
    await tx.tenantUserRole.create({
      data: { membershipId: targetMembership.id, roleId: newRoleId },
    });
  });

  const action =
    actorContext === "VENDOR" ? "admin.workspace.member.role_changed" : "tenant.role.changed";
  await writeAuditLog({
    actorUserId,
    actorContext: actorContext === "VENDOR" ? "VENDOR" : "TENANT",
    tenantId,
    action,
    targetType: "TenantMembership",
    targetId: targetMembership.id,
    targetUserId: targetMembership.userId,
    metadata: { previousRole: currentTargetRole, newRole },
    ...auditMeta,
  });
  return { ok: true };
}

/** Change member status. When VENDOR, hierarchy checks skipped; invariants enforced. */
export async function executeChangeMemberStatus(params: {
  tenantId: string;
  targetMembershipId: string;
  newStatus: "ACTIVE" | "DISABLED";
  actorUserId: string;
  actorContext: ActorContext;
  auditMeta: AuditMeta;
}): Promise<
  | { ok: true }
  | { error: "NOT_FOUND"; message: string }
  | { error: "VALIDATION"; message: string; code?: string }
> {
  const { tenantId, targetMembershipId, newStatus, actorUserId, actorContext, auditMeta } = params;

  const targetMembership = await prisma.tenantMembership.findFirst({
    where: { id: targetMembershipId, tenantId },
    select: {
      id: true,
      userId: true,
      status: true,
      roles: { select: { role: { select: { name: true } } } },
    },
  });
  if (!targetMembership) return { error: "NOT_FOUND", message: "Member not found" };

  const targetRole = getHighestRoleName(targetMembership.roles.map((r) => r.role.name)) ?? "Member";
  if (targetRole === "Primary Owner")
    return {
      error: "VALIDATION",
      message: "Transfer primary ownership before disabling the primary owner.",
      code: "USE_TRANSFER_PRIMARY_OWNERSHIP",
    };

  if (actorContext === "TENANT") {
    const actorMembership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: actorUserId } },
      select: { roles: { select: { role: { select: { name: true } } } } },
    });
    if (!actorMembership) return { error: "NOT_FOUND", message: "Member not found" };
    const actorRole = getHighestRoleName(actorMembership.roles.map((r) => r.role.name)) ?? "Member";
    if (!canManageTargetByRole(actorRole, targetRole))
      return { error: "VALIDATION", message: "Insufficient permissions." };
    if (newStatus === "DISABLED" && isOwnerLevel(targetRole)) {
      if (actorRole !== "Primary Owner") {
        const ownerLevelCount = await getOwnerLevelCount(tenantId);
        if (ownerLevelCount <= 1)
          return { error: "VALIDATION", message: "Cannot disable the last owner-level user." };
      }
    }
  } else {
    if (newStatus === "DISABLED" && isOwnerLevel(targetRole)) {
      const ownerLevelCount = await getOwnerLevelCount(tenantId);
      if (ownerLevelCount <= 1)
        return { error: "VALIDATION", message: "Cannot disable the last owner-level user." };
    }
  }

  await prisma.tenantMembership.update({
    where: { id: targetMembership.id },
    data: { status: newStatus },
  });

  if (newStatus === "ACTIVE") {
    const activeWithDefault = await prisma.tenantMembership.findMany({
      where: {
        userId: targetMembership.userId,
        status: "ACTIVE",
        tenant: { status: "ACTIVE" },
        isDefaultTenant: true,
      },
      select: { id: true },
      orderBy: { joinedAt: "desc" },
    });
    if (activeWithDefault.length > 1) {
      const keepId = activeWithDefault[0]!.id;
      await prisma.tenantMembership.updateMany({
        where: { userId: targetMembership.userId, status: "ACTIVE", id: { not: keepId } },
        data: { isDefaultTenant: false },
      });
    }
  }

  const action =
    actorContext === "VENDOR"
      ? "admin.workspace.member.status_changed"
      : newStatus === "ACTIVE"
        ? "tenant.user.enabled"
        : "tenant.user.disabled";
  await writeAuditLog({
    actorUserId,
    actorContext: actorContext === "VENDOR" ? "VENDOR" : "TENANT",
    tenantId,
    action,
    targetType: "TenantMembership",
    targetId: targetMembership.id,
    targetUserId: targetMembership.userId,
    metadata: { previousStatus: targetMembership.status, newStatus },
    ...auditMeta,
  });
  return { ok: true };
}

/** Create invitation. Returns invite + inviteUrl; optionally sends email when sendEmail is true and req provided. */
export async function executeCreateInvitation(params: {
  tenantId: string;
  email: string;
  sendEmail?: boolean;
  actorUserId: string;
  actorContext: ActorContext;
  req?: Request;
}): Promise<
  | { ok: true; invitation: { id: string; email: string; expiresAt: Date }; inviteUrl: string }
  | { error: "NOT_FOUND"; message: string }
  | { error: "VALIDATION"; message: string }
  | { error: "CONFLICT"; message: string; code: string }
> {
  const { tenantId, email, sendEmail = true, actorUserId, actorContext, req } = params;
  const emailNormalized = normalizeEmail(email);

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { id: true, name: true },
  });
  if (!tenant) return { error: "NOT_FOUND", message: "Workspace not found" };

  const existingUser = await prisma.user.findUnique({
    where: { email: emailNormalized },
    select: { id: true },
  });
  if (existingUser) {
    const existingMembership = await prisma.tenantMembership.findUnique({
      where: { tenantId_userId: { tenantId, userId: existingUser.id } },
      select: { id: true },
    });
    if (existingMembership)
      return { error: "VALIDATION", message: "User is already a member of this tenant" };
  }

  const now = new Date();
  const activeInvite = await prisma.tenantInvitation.findFirst({
    where: {
      tenantId,
      email: emailNormalized,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });
  if (activeInvite)
    return { error: "CONFLICT", message: "An active invite already exists for this email.", code: "ACTIVE_INVITE_EXISTS" };

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  const invite = await prisma.tenantInvitation.create({
    data: {
      tenantId,
      email: emailNormalized,
      tokenHash,
      expiresAt,
      invitedByUserId: actorUserId,
    },
    select: { id: true, email: true, expiresAt: true },
  });

  const action = actorContext === "VENDOR" ? "admin.workspace.invite.created" : "tenant.user.invited";
  const ipAddress = req?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req?.headers.get("user-agent") ?? null;
  await writeAuditLog({
    actorUserId,
    actorContext: actorContext === "VENDOR" ? "VENDOR" : "TENANT",
    tenantId,
    action,
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { email: invite.email, expiresAt: invite.expiresAt.toISOString(), sendEmail },
    ipAddress,
    userAgent,
  });

  const baseUrl = req ? getBaseUrlFromRequest(req) : process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const inviteUrl = `${baseUrl.replace(/\/$/, "")}/invite?token=${encodeURIComponent(rawToken)}`;

  if (sendEmail && req) {
    await sendInvitationEmail({
      tenantName: tenant.name,
      invitedEmail: invite.email,
      rawToken,
      baseUrl,
    });
  }

  return { ok: true, invitation: invite, inviteUrl };
}

/** Revoke invitation. */
export async function executeRevokeInvitation(params: {
  tenantId: string;
  inviteId: string;
  actorUserId: string;
  actorContext: ActorContext;
  auditMeta: AuditMeta;
}): Promise<
  | { ok: true }
  | { error: "NOT_FOUND"; message: string }
  | { error: "VALIDATION"; message: string }
> {
  const { tenantId, inviteId, actorUserId, actorContext, auditMeta } = params;

  const invite = await prisma.tenantInvitation.findFirst({
    where: { id: inviteId, tenantId },
    select: { id: true, email: true, acceptedAt: true, revokedAt: true, expiresAt: true },
  });
  if (!invite) return { error: "NOT_FOUND", message: "Invitation not found" };

  const now = new Date();
  const isActive = !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > now;
  if (!isActive) return { error: "VALIDATION", message: "Only active invitations can be revoked." };

  await prisma.tenantInvitation.update({
    where: { id: invite.id },
    data: { revokedAt: now },
  });

  const action = actorContext === "VENDOR" ? "admin.workspace.invite.revoked" : "tenant.invite.revoked";
  await writeAuditLog({
    actorUserId,
    actorContext: actorContext === "VENDOR" ? "VENDOR" : "TENANT",
    tenantId,
    action,
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { email: invite.email },
    ...auditMeta,
  });
  return { ok: true };
}

/** Resend invitation (active/pending only): new token, extend expiry, send email. */
export async function executeResendInvitation(params: {
  tenantId: string;
  inviteId: string;
  actorUserId: string;
  actorContext: ActorContext;
  req: Request;
  auditMeta: AuditMeta;
}): Promise<
  | { ok: true }
  | { error: "NOT_FOUND"; message: string }
  | { error: "VALIDATION"; message: string }
> {
  const { tenantId, inviteId, actorUserId, actorContext, req, auditMeta } = params;
  const now = new Date();

  const invite = await prisma.tenantInvitation.findFirst({
    where: { id: inviteId, tenantId },
    select: { id: true, email: true, acceptedAt: true, revokedAt: true, expiresAt: true },
  });
  if (!invite) return { error: "NOT_FOUND", message: "Invitation not found" };

  const isActive = !invite.acceptedAt && !invite.revokedAt && invite.expiresAt > now;
  if (!isActive) {
    return { error: "VALIDATION", message: "Only active (pending) invitations can be resent." };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.tenantInvitation.update({
    where: { id: invite.id },
    data: { tokenHash, expiresAt },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  const action = actorContext === "VENDOR" ? "admin.workspace.invite.resent" : "tenant.invite.resent";
  await writeAuditLog({
    actorUserId,
    actorContext: actorContext === "VENDOR" ? "VENDOR" : "TENANT",
    tenantId,
    action,
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { email: invite.email },
    ...auditMeta,
  });

  if (tenant) {
    const baseUrl = getBaseUrlFromRequest(req);
    await sendInvitationEmail({
      tenantName: tenant.name,
      invitedEmail: invite.email,
      rawToken,
      baseUrl,
    });
  }
  return { ok: true };
}

/** Re-invite (revoked/expired/rejected): reset invite to pending, new token, send email. */
export async function executeReinviteInvitation(params: {
  tenantId: string;
  inviteId: string;
  actorUserId: string;
  actorContext: ActorContext;
  req: Request;
  auditMeta: AuditMeta;
}): Promise<
  | { ok: true }
  | { error: "NOT_FOUND"; message: string }
  | { error: "VALIDATION"; message: string }
> {
  const { tenantId, inviteId, actorUserId, actorContext, req, auditMeta } = params;
  const now = new Date();

  const invite = await prisma.tenantInvitation.findFirst({
    where: { id: inviteId, tenantId },
    select: { id: true, email: true, acceptedAt: true, revokedAt: true, expiresAt: true },
  });
  if (!invite) return { error: "NOT_FOUND", message: "Invitation not found" };

  if (invite.acceptedAt) {
    return { error: "VALIDATION", message: "Cannot re-invite an accepted invitation." };
  }

  const isActive = !invite.revokedAt && invite.expiresAt > now;
  if (isActive) {
    return { error: "VALIDATION", message: "Use resend for active (pending) invitations." };
  }

  const rawToken = crypto.randomBytes(32).toString("hex");
  const tokenHash = sha256(rawToken);
  const expiresAt = new Date(Date.now() + 1000 * 60 * 60 * 24 * 7);

  await prisma.tenantInvitation.update({
    where: { id: invite.id },
    data: {
      tokenHash,
      expiresAt,
      revokedAt: null,
      rejectedAt: null,
      rejectedByUserId: null,
    },
  });

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: { name: true },
  });
  const action = actorContext === "VENDOR" ? "admin.workspace.invite.reinvited" : "tenant.user.invited";
  await writeAuditLog({
    actorUserId,
    actorContext: actorContext === "VENDOR" ? "VENDOR" : "TENANT",
    tenantId,
    action,
    targetType: "TenantInvitation",
    targetId: invite.id,
    metadata: { email: invite.email, reinvite: true, expiresAt: expiresAt.toISOString() },
    ...auditMeta,
  });

  if (tenant) {
    const baseUrl = getBaseUrlFromRequest(req);
    await sendInvitationEmail({
      tenantName: tenant.name,
      invitedEmail: invite.email,
      rawToken,
      baseUrl,
    });
  }
  return { ok: true };
}
