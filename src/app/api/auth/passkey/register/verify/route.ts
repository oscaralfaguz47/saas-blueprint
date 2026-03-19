import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireFullSession } from "@/server/require-full-session";
import { verifyPasskeyRegistration } from "@/server/services/passkey";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const bodySchema = z.object({
  response: z.any(),
  name: z.string().max(100).optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const body = await req.json().catch(() => null);
  const parse = bodySchema.safeParse(body);
  if (!parse.success) return ApiErrors.VALIDATION_ERROR("Invalid request body");

  await verifyPasskeyRegistration(
    session.user.id,
    parse.data.response,
    parse.data.name
  );

  return apiSuccess({ ok: true });
});
