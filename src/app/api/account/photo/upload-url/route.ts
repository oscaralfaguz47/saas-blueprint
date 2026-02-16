import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import {
  buildProfilePhotoObjectKey,
  getPresignedPutUrlProfilePhoto,
  isR2Configured,
} from "@/server/services/r2-profile-photo";
import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, photoUploadUrlSchema } from "@/lib/validations";

/**
 * POST /api/account/photo/upload-url
 * Returns presigned PUT URL for profile photo (users/{userId}/avatar/).
 */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.NOT_FOUND("User");
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  if (!isR2Configured()) {
    return apiError(
      "SERVICE_UNAVAILABLE",
      503,
      "Profile photo upload is not configured. Set R2_* environment variables."
    );
  }

  const body = await parseBody(req, photoUploadUrlSchema);
  const objectKey = buildProfilePhotoObjectKey(session.user.id, body.extension);
  const result = await getPresignedPutUrlProfilePhoto({
    objectKey,
    contentType: body.contentType,
  });

  if (!result) {
    return apiError("SERVICE_UNAVAILABLE", 503, "Failed to generate upload URL.");
  }

  return apiSuccess({
    uploadUrl: result.uploadUrl,
    objectKey: result.objectKey,
  });
});
