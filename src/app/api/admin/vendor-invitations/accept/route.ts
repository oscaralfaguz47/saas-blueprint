import { createHash } from "node:crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { vendorInvitationAcceptBodySchema } from "@/lib/validations/admin";
import { requireFullSession } from "@/server/require-full-session";
import { writeAuditLog } from "@/server/services/audit";

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  let body;
  try {
    body = vendorInvitationAcceptBodySchema.parse(await req.json());
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const tokenHash = createHash("sha256").update(body.token).digest("hex");
  const now = new Date();

  const invitation = await prisma.vendorInvitation.findFirst({
    where: {
      tokenHash,
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: now },
    },
    select: { id: true, email: true, roleName: true },
  });

  if (!invitation) return ApiErrors.NOT_FOUND("Invitation");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true },
  });
  if (!user?.email) return ApiErrors.FORBIDDEN();

  if (user.email.trim().toLowerCase() !== invitation.email.toLowerCase()) {
    return ApiErrors.FORBIDDEN();
  }

  const role = await prisma.vendorRole.findUnique({
    where: { name: invitation.roleName },
    select: { id: true },
  });
  if (!role) return ApiErrors.NOT_FOUND("Vendor role");

  await prisma.$transaction([
    prisma.vendorUserRole.upsert({
      where: { userId_roleId: { userId: user.id, roleId: role.id } },
      update: {},
      create: { userId: user.id, roleId: role.id },
    }),
    prisma.vendorInvitation.update({
      where: { id: invitation.id },
      data: { acceptedAt: now },
    }),
  ]);

  const ipAddress = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  const userAgent = req.headers.get("user-agent") ?? null;
  await writeAuditLog({
    actorUserId: user.id,
    actorContext: "VENDOR",
    action: "admin.vendor_user.invitation_accepted",
    targetType: "VendorInvitation",
    targetId: invitation.id,
    metadata: { roleName: invitation.roleName },
    ipAddress,
    userAgent,
  });

  return apiSuccess({ ok: true, roleName: invitation.roleName });
});
