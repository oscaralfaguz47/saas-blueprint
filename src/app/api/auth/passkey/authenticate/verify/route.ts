import "server-only";
import { verifyPasskeyAuthentication } from "@/server/services/passkey";
import { createPasskeyOneTimeToken } from "@/server/auth-options";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { writeAuditLog } from "@/server/services/audit";
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
    const passkeyToken = await createPasskeyOneTimeToken(user.id);

    writeAuditLog({
      actorUserId: user.id,
      actorContext: "TENANT",
      tenantId: null,
      action: "auth.passkey.used",
      targetType: "User",
      targetId: user.id,
      targetUserId: user.id,
      metadata: { credentialId: parse.data.response.id },
      ipAddress: req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
      userAgent: req.headers.get("user-agent") ?? null,
    }).catch(() => {});

    return apiSuccess({ passkeyToken });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    if (msg.includes("Challenge expired") || msg.includes("not found")) {
      return ApiErrors.PASSKEY_CHALLENGE_EXPIRED();
    }
    return ApiErrors.PASSKEY_VERIFICATION_FAILED();
  }
});
