import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { generatePasskeyRegistrationOptions } from "@/server/services/passkey";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";

export const POST = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, email: true, name: true },
  });
  if (!user?.email) return ApiErrors.NOT_FOUND("User");

  const options = await generatePasskeyRegistrationOptions(
    user.id,
    user.email,
    user.name
  );

  return apiSuccess(options);
});
