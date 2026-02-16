import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/server/db";

const COOKIE_NAME = "__Host-rmd";
const TOKEN_BYTES = 32; // 256-bit
const HASH_ALGO = "sha256";

export function hashRememberDeviceToken(token: string): string {
  return createHash(HASH_ALGO).update(token, "utf8").digest("hex");
}

/**
 * Generate a new remember-device token (raw for cookie, hash for DB).
 */
export function generateRememberDeviceToken(): { raw: string; hash: string } {
  const raw = randomBytes(TOKEN_BYTES).toString("base64url");
  const hash = hashRememberDeviceToken(raw);
  return { raw, hash };
}

export type RememberedDeviceValidation =
  | { valid: true; userId: string }
  | { valid: false };

/**
 * Validate __Host-rmd cookie token: same user, not revoked, not expired.
 */
export async function validateRememberedDevice(
  tokenHash: string
): Promise<RememberedDeviceValidation> {
  const device = await prisma.rememberedDevice.findUnique({
    where: { tokenHash },
    select: { userId: true, revokedAt: true, expiresAt: true },
  });

  if (!device || device.revokedAt || device.expiresAt <= new Date()) {
    return { valid: false };
  }

  return { valid: true, userId: device.userId };
}

const REMEMBER_DAYS_ALLOWED = [30, 60, 90] as const;
export type RememberDays = (typeof REMEMBER_DAYS_ALLOWED)[number];

export function isValidRememberDays(days: number): days is RememberDays {
  return REMEMBER_DAYS_ALLOWED.includes(days as RememberDays);
}

export function getRememberDeviceExpiry(days: RememberDays): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

/**
 * Build cookie options for remember-device (HttpOnly, Secure in prod, SameSite=Lax, Path=/).
 * Caller must use getRememberDeviceCookieName() as the cookie name so set and read match (e.g. "rmd" in dev, "__Host-rmd" in prod).
 */
export function rememberDeviceCookieOptions(maxAgeSeconds: number) {
  const isProd = process.env.NODE_ENV === "production";
  return {
    httpOnly: true,
    secure: isProd,
    sameSite: "lax" as const,
    path: "/",
    maxAge: maxAgeSeconds,
  };
}

export function getRememberDeviceCookieName(): string {
  return process.env.NODE_ENV === "production" ? COOKIE_NAME : "rmd";
}
