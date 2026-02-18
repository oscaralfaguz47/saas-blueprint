import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import AuthCard from "@/components/auth/auth-card";
import { TwoFaChallengeForm } from "./two-fa-challenge-form";
import {
  getRememberDeviceCookieName,
  hashRememberDeviceToken,
  validateRememberedDevice,
} from "@/server/services/remember-device";

export const dynamic = "force-dynamic";

export default async function TwoFaPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/auth/sign-in");
  if (!session.user.totpEnabled) redirect("/auth/setup-2fa");
  if (
    session.user.mfaVerified &&
    session.user.authLevel === "FULL"
  ) {
    redirect("/app");
  }

  // If PENDING_MFA and valid remember-device cookie for this user, upgrade session to FULL and redirect.
  if (
    session.user.authLevel === "PENDING_MFA" &&
    session.user.sessionToken
  ) {
    const cookieStore = await cookies();
    const rmdName = getRememberDeviceCookieName();
    const rawToken = cookieStore.get(rmdName)?.value;
    if (rawToken) {
      const hash = hashRememberDeviceToken(rawToken);
      const validation = await validateRememberedDevice(hash);
      if (validation.valid && validation.userId === session.user.id) {
        const now = new Date();
        await prisma.session.updateMany({
          where: { sessionToken: session.user.sessionToken },
          data: { authLevel: "FULL", mfaVerifiedAt: now },
        });
        redirect("/app");
      }
    }
  }

  const security = await prisma.userSecurity.findUnique({
    where: { userId: session.user.id },
    select: { backupCodeHashes: true },
  });
  const hasBackupCodes =
    Array.isArray(security?.backupCodeHashes) && security.backupCodeHashes.length > 0;

  return (
    <AuthCard
      title="Two-factor authentication"
      subtitle="Enter the 6-digit code from your authenticator app or a backup code."
    >
      <TwoFaChallengeForm hasBackupCodes={hasBackupCodes} />
    </AuthCard>
  );
}
