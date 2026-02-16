import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getPresignedGetUrlProfilePhoto, isR2Configured } from "@/server/services/r2-profile-photo";
import { AccountSettingsTabs } from "@/components/app/account/account-settings-tabs";

export default async function AccountPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");

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
    },
  });
  if (!user) redirect("/auth/sign-in");

  const [account, security] = await Promise.all([
    prisma.account.findFirst({
      where: { userId: user.id },
      select: { provider: true },
    }),
    prisma.userSecurity.findUnique({
      where: { userId: user.id },
      select: {
        totpEnabled: true,
        totpPendingSecretEnc: true,
        autoLogoutEnabled: true,
        autoLogoutMinutes: true,
        backupCodesGeneratedAt: true,
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

  const profile = {
    id: user.id,
    name: user.name ?? null,
    email: user.email ?? null,
    phone: user.phone ?? null,
    timezone: user.timezone ?? null,
    appearance: user.appearance,
    avatarUrl,
  };

  const securityFlags = {
    totpEnabled: security?.totpEnabled ?? false,
    totpPendingSetup: !!security?.totpPendingSecretEnc,
    autoLogoutEnabled: security?.autoLogoutEnabled ?? false,
    autoLogoutMinutes: security?.autoLogoutMinutes ?? 21600,
    backupCodesGeneratedAt: security?.backupCodesGeneratedAt?.toISOString() ?? null,
  };

  return (
    <AccountSettingsTabs
      profile={profile}
      loginMethod={loginMethod}
      security={securityFlags}
    />
  );
}
