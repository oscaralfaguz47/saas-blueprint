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

  const [accounts, security] = await Promise.all([
    prisma.account.findMany({
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

  const linkedProviders = accounts.map((a) => a.provider);
  const loginMethodLabel =
    linkedProviders.length > 1
      ? `Signed in with ${linkedProviders.join(", ")}`
      : linkedProviders.includes("google")
        ? "Signed in with Google"
        : linkedProviders.includes("azure-ad")
          ? "Signed in with Microsoft"
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

  const authLevel = session.user.authLevel ?? "FULL";

  return (
    <AccountSettingsTabs
      profile={profile}
      loginMethod={loginMethodLabel}
      linkedProviders={linkedProviders}
      authLevel={authLevel}
      security={securityFlags}
      currentUserEmail={user.email ?? null}
    />
  );
}
