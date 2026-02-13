import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { getPresignedGetUrlProfilePhoto, isR2Configured } from "@/server/services/r2-profile-photo";

/**
 * GET /api/account/me
 * Returns current user profile, login provider, and security flags (no secrets).
 */
export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      name: true,
      email: true,
      image: true,
      phone: true,
      timezone: true,
      appearance: true,
      profilePhotoObjectKey: true,
      isPlatformBlocked: true,
    },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const [account, security] = await Promise.all([
    prisma.account.findFirst({
      where: { userId: user.id },
      select: { provider: true },
    }),
    prisma.userSecurity.findUnique({
      where: { userId: user.id },
      select: {
        totpEnabled: true,
        autoLogoutEnabled: true,
        autoLogoutHours: true,
      },
    }),
  ]);

  let avatarUrl: string | null = null;
  if (user.profilePhotoObjectKey && isR2Configured()) {
    avatarUrl = await getPresignedGetUrlProfilePhoto(user.profilePhotoObjectKey);
  }
  if (!avatarUrl && user.image) avatarUrl = user.image;

  const loginMethod =
    account?.provider === "google"
      ? "Signed in with Google"
      : "Signed in with Magic link / Email";

  return apiSuccess({
    profile: {
      id: user.id,
      name: user.name ?? null,
      email: user.email ?? null,
      phone: user.phone ?? null,
      timezone: user.timezone ?? null,
      appearance: user.appearance,
      avatarUrl,
    },
    loginMethod,
    security: {
      totpEnabled: security?.totpEnabled ?? false,
      autoLogoutEnabled: security?.autoLogoutEnabled ?? false,
      autoLogoutHours: security?.autoLogoutHours ?? 5,
    },
  });
});
