import "server-only";
import { verifyPasskeyAuthentication } from "@/server/services/passkey";
import { createPasskeyOneTimeToken } from "@/server/auth-options";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const bodySchema = z.object({
  challengeKey: z.string(),
  response: z.any(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json().catch(() => null);
  const parse = bodySchema.safeParse(body);
  if (!parse.success) return ApiErrors.VALIDATION_ERROR("Invalid request body");

  try {
    const { user } = await verifyPasskeyAuthentication(
      parse.data.challengeKey,
      parse.data.response
    );
    const passkeyToken = createPasskeyOneTimeToken(user.id);
    return apiSuccess({ passkeyToken });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Challenge expired") || msg.includes("not found")) {
      return ApiErrors.PASSKEY_CHALLENGE_EXPIRED();
    }
    return ApiErrors.PASSKEY_VERIFICATION_FAILED();
  }
});
