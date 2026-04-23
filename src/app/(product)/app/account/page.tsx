import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { getPresignedGetUrlProfilePhoto, isR2Configured } from "@/server/services/r2-profile-photo";
import { AccountSettingsTabs } from "@/components/app/account/account-settings-tabs";

type Props = {
  searchParams?: Promise<{
    tab?: string;
    vendorSetup2fa?: string;
    [key: string]: string | undefined;
  }>;
};

export default async function AccountPage({ searchParams }: Props) {
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

  const params = await searchParams;
  const vendorSetup2fa = params?.vendorSetup2fa === "1";

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
    <div className="h-full min-h-0 overflow-y-auto px-3 py-4 sm:px-6 sm:py-6">
      <AccountSettingsTabs
        profile={profile}
        linkedProviders={linkedProviders}
        authLevel={authLevel}
        security={securityFlags}
        currentUserEmail={user.email ?? null}
        vendorSetup2fa={vendorSetup2fa}
      />
    </div>
  );
}
