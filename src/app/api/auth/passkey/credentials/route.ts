import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { prisma } from "@/server/db";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const credentials = await prisma.webAuthnCredential.findMany({
    where: { userId: session.user.id },
    select: {
      id: true,
      name: true,
      deviceType: true,
      backedUp: true,
      createdAt: true,
      lastUsedAt: true,
      aaguid: true,
    },
    orderBy: { createdAt: "desc" },
  });

  return apiSuccess({ credentials });
});

export const DELETE = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const body = await req.json().catch(() => null);
  const parse = z.object({ credentialId: z.string() }).safeParse(body);
  if (!parse.success) return ApiErrors.VALIDATION_ERROR("Invalid credential id");

  // Verify ownership before deleting (credentialId in body is the record id / cuid)
  const credential = await prisma.webAuthnCredential.findUnique({
    where: { id: parse.data.credentialId },
    select: { userId: true },
  });

  if (!credential) return ApiErrors.NOT_FOUND("Credential");
  if (credential.userId !== session.user.id) return ApiErrors.FORBIDDEN();

  // Safety: don't allow deleting last passkey if it's the only sign-in method
  const remainingPasskeys = await prisma.webAuthnCredential.count({
    where: { userId: session.user.id },
  });
  const accounts = await prisma.account.count({
    where: { userId: session.user.id },
  });

  if (remainingPasskeys <= 1 && accounts === 0) {
    return ApiErrors.VALIDATION_ERROR(
      "Cannot remove your only sign-in method. Add another sign-in method first."
    );
  }

  await prisma.webAuthnCredential.delete({
    where: { id: parse.data.credentialId },
  });

  return apiSuccess({ ok: true });
});
