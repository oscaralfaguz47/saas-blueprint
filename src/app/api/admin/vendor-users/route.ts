import { createHash, randomBytes } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { env } from "@/lib/env";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { vendorInviteBodySchema } from "@/lib/validations/admin";
import {
  checkAdminMutationLimit,
  checkAdminWorkspacesListLimit,
} from "@/server/security/admin-rate-limit";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { isBootstrapAllowlistedEmail } from "@/server/services/platform-bootstrap";
import {
  sendEmail,
  sendVendorInviteEmail,
} from "@/server/services/invitation-email";
import {
  buildEmailShell,
  escapeHtml,
  resolveSender,
  EMAIL_THEME,
} from "@/server/services/email-templates";
import { writeAuditLog } from "@/server/services/audit";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminWorkspacesListLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many requests. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const rows = await prisma.vendorUserRole.findMany({
    select: {
      role: { select: { name: true } },
      user: {
        select: {
          id: true,
          name: true,
          email: true,
          security: { select: { totpEnabled: true } },
        },
      },
    },
  });

  const byUser = new Map<
    string,
    {
      userId: string;
      name: string | null;
      email: string | null;
      totpEnabled: boolean;
      isBootstrapAdmin: boolean;
      roles: string[];
    }
  >();

  for (const row of rows) {
    const existing = byUser.get(row.user.id);
    if (existing) {
      existing.roles.push(row.role.name);
      continue;
    }

    byUser.set(row.user.id, {
      userId: row.user.id,
      name: row.user.name ?? null,
      email: row.user.email ?? null,
      totpEnabled: row.user.security?.totpEnabled ?? false,
      isBootstrapAdmin: isBootstrapAllowlistedEmail(row.user.email),
      roles: [row.role.name],
    });
  }

  return apiSuccess({
    users: Array.from(byUser.values())
      .map((u) => ({
        ...u,
        roles: Array.from(new Set(u.roles)),
      }))
      .sort((a, b) =>
        (a.name ?? a.email ?? "").localeCompare(b.name ?? b.email ?? "", undefined, {
          sensitivity: "base",
        })
      ),
  });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.tenants.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkAdminMutationLimit(session.user.id);
  if (!rl.allowed)
    return ApiErrors.RATE_LIMITED("Too many actions. Try again in a minute.", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });

  const actor = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!actor) return ApiErrors.UNAUTHENTICATED();

  const actorPlatformAdminRole = await prisma.vendorUserRole.findFirst({
    where: {
      userId: actor.id,
      role: { name: "PlatformAdmin" },
    },
    select: { userId: true },
  });
  if (!actorPlatformAdminRole) return ApiErrors.FORBIDDEN();

  let body;
  try {
    body = vendorInviteBodySchema.parse(await req.json());
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const actorIsSuperAdmin = isBootstrapAllowlistedEmail(actor.email);
  if (!actorIsSuperAdmin && body.roleName === "PlatformAdmin") {
    return ApiErrors.FORBIDDEN();
  }

  if (!actorIsSuperAdmin && isBootstrapAllowlistedEmail(body.email)) {
    return ApiErrors.FORBIDDEN();
  }

  const role = await prisma.vendorRole.findUnique({
    where: { name: body.roleName },
    select: { id: true, name: true },
  });
  if (!role) return ApiErrors.NOT_FOUND("Vendor role");

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;

  const existingUser = await prisma.user.findFirst({
    where: { email: { equals: body.email, mode: "insensitive" } },
    select: { id: true, email: true, name: true },
  });

  if (existingUser) {
    const existingRoles = await prisma.vendorUserRole.findMany({
      where: { userId: existingUser.id },
      select: { role: { select: { name: true } } },
    });
    if (existingRoles.length > 0) {
      const roleNames = existingRoles.map((r) => r.role.name).join(", ");
      return ApiErrors.CONFLICT(
        `This user already has vendor access (${roleNames}). Use the role selector in the table to change their role.`
      );
    }

    await prisma.vendorUserRole.upsert({
      where: {
        userId_roleId: {
          userId: existingUser.id,
          roleId: role.id,
        },
      },
      update: {},
      create: {
        userId: existingUser.id,
        roleId: role.id,
      },
    });

    try {
      const appName = env.APP_NAME ?? "Relitrue";
      const t = EMAIL_THEME;
      const bodyHtml = `
        <p style="margin:0;font-size:15px;color:${t.colorTextBody};">
          You've been granted platform admin access to <strong>${escapeHtml(appName)}</strong>
          as <strong>${escapeHtml(role.name)}</strong>.
        </p>
        <p style="margin:12px 0 0;font-size:14px;color:${t.colorTextMuted};">
          Sign in to your account to continue. Two-factor authentication (2FA) is required.
        </p>`;
      await sendEmail({
        to: body.email,
        subject: "You've been granted platform admin access",
        html: buildEmailShell({
          title: "Platform admin access granted",
          preheader: `You now have platform admin access to ${appName}`,
          bodyHtml,
          footerNote: `You're receiving this because your account was granted admin access to ${appName}.`,
        }),
        from: resolveSender("notifications"),
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown";
      console.error("[vendor-users] notification email failed:", msg);
    }

    await writeAuditLog({
      actorUserId: actor.id,
      actorContext: "VENDOR",
      action: "admin.vendor_user.role_assigned",
      targetType: "User",
      targetId: existingUser.id,
      metadata: { roleName: role.name, method: "direct" },
      ipAddress,
      userAgent,
    });

    return apiSuccess({ ok: true, method: "assigned" as const });
  }

  const now = new Date();
  const activeInvite = await prisma.vendorInvitation.findFirst({
    where: {
      email: body.email,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, roleName: true },
  });
  if (activeInvite) {
    return ApiErrors.CONFLICT(
      `A pending invitation already exists for this email (${activeInvite.roleName}). Revoke it first if you want to change the role.`
    );
  }

  const rawToken = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");

  const baseUrl = (
    env.NEXTAUTH_URL ??
    env.NEXT_PUBLIC_APP_URL ??
    ""
  ).replace(/\/$/, "");
  if (!baseUrl) {
    return ApiErrors.INTERNAL_ERROR("Application URL is not configured for invitation links.");
  }

  try {
    await sendVendorInviteEmail({
      invitedEmail: body.email,
      roleName: body.roleName,
      rawToken,
      baseUrl,
      appName: env.APP_NAME,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error("[vendor-users] vendor invite email failed:", msg);
    return ApiErrors.INTERNAL_ERROR("Could not send invitation email. Please try again.");
  }

  const invitation = await prisma.vendorInvitation.create({
    data: {
      email: body.email,
      roleName: body.roleName,
      tokenHash,
      invitedByUserId: actor.id,
      expiresAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
    },
    select: { id: true },
  });

  await writeAuditLog({
    actorUserId: actor.id,
    actorContext: "VENDOR",
    action: "admin.vendor_user.invited",
    targetType: "VendorInvitation",
    targetId: invitation.id,
    metadata: { email: body.email, roleName: body.roleName },
    ipAddress,
    userAgent,
  });

  return apiSuccess({ ok: true, method: "invited" as const });
});
