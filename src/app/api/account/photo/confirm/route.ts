import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import {
  doesProfilePhotoExist,
  deleteProfilePhotoObject,
  isR2Configured,
} from "@/server/services/r2-profile-photo";
import { writeAuditLog } from "@/server/services/audit";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, photoConfirmSchema } from "@/lib/validations";

const PREFIX = "users/";

/**
 * POST /api/account/photo/confirm
 * Confirm upload and set User.profilePhotoObjectKey. Verify object key prefix and existence.
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = requireFullSession(session);
  if (mfaError) return mfaError;

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true, profilePhotoObjectKey: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  if (!isR2Configured()) {
    return ApiErrors.INTERNAL_ERROR("Profile photo upload is not configured.");
  }

  const body = await parseBody(req, photoConfirmSchema);
  const expectedPrefix = `${PREFIX}${session.user.id}/avatar/`;
  if (!body.objectKey.startsWith(expectedPrefix)) {
    return ApiErrors.VALIDATION_ERROR("Invalid object key for your account.");
  }

  const exists = await doesProfilePhotoExist(body.objectKey);
  if (!exists) {
    return ApiErrors.VALIDATION_ERROR("Upload not found. Please upload the file first.");
  }

  const previousKey = user.profilePhotoObjectKey;
  await prisma.user.update({
    where: { id: session.user.id },
    data: { profilePhotoObjectKey: body.objectKey },
  });

  if (previousKey && previousKey !== body.objectKey) {
    try {
      await deleteProfilePhotoObject(previousKey);
    } catch (err) {
      console.error("[api/account/photo/confirm] failed to delete previous photo:", err);
    }
  }

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "TENANT",
    tenantId: null,
    action: "account.profile.photo_updated",
    targetType: "User",
    targetId: session.user.id,
    targetUserId: session.user.id,
  });

  return apiSuccess({ ok: true });
});
