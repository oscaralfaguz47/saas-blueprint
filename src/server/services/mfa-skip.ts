import "server-only";

import { ReadonlyRequestCookies } from "next/dist/server/web/spec-extension/adapters/request-cookies";
import { Session } from "next-auth";
import { prisma } from "@/server/db";
import {
  getRememberDeviceCookieName,
  hashRememberDeviceToken,
  validateRememberedDevice,
} from "@/server/services/remember-device";

/**
 * Checks if the current session is PENDING_MFA but the device is remembered.
 * If valid, upgrades the session to FULL in the database and returns true.
 * Returns false if no valid remember token is found or session is already FULL.
 */
export async function trySkipMfaWithRememberedDevice(
  session: Session | null,
  cookieStore: ReadonlyRequestCookies
): Promise<boolean> {
  if (
    !session?.user?.id ||
    session.user.authLevel !== "PENDING_MFA" ||
    !session.user.sessionToken
  ) {
    return false;
  }

  const rmdName = getRememberDeviceCookieName();
  const rawToken = cookieStore.get(rmdName)?.value;

  if (!rawToken) return false;

  const hash = hashRememberDeviceToken(rawToken);
  const validation = await validateRememberedDevice(hash);

  if (validation.valid && validation.userId === session.user.id) {
    const now = new Date();
    await prisma.session.updateMany({
      where: { sessionToken: session.user.sessionToken },
      data: {
        authLevel: "FULL",
        mfaVerifiedAt: now,
      },
    });
    return true;
  }

  return false;
}
