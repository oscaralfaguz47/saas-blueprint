import "server-only";

import type { Session } from "next-auth";
import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { requirePlatformPermission } from "@/server/security/platform-authorization";
import type { VendorPermission } from "@/server/security/vendor-authorization";
import { ApiErrors } from "@/lib/api-response";

/**
 * Enforce auth + MFA + platform-block + vendor permission for /api/admin/* routes.
 * Returns NextResponse on failure (401/403/404); returns null when authorized.
 * Prefer 404 for unauthorized access to reduce discoverability (per EPIC).
 */
export async function requireAdminAuth(
  session: Session | null,
  permission: VendorPermission
): Promise<NextResponse | null> {
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  try {
    await requirePlatformPermission({
      userId: session.user.id,
      legacyRole: session.user.role,
      permission,
    });
  } catch {
    return NextResponse.json(
      { error: { code: "NOT_FOUND", message: "Not found" } },
      { status: 404 }
    );
  }
  return null;
}
