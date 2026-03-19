import "server-only";
import { generatePasskeyAuthenticationOptions } from "@/server/services/passkey";
import { apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const bodySchema = z.object({
  userId: z.string().optional(),
});

export const POST = withErrorHandler(async (req: Request) => {
  const body = await req.json().catch(() => ({}));
  const parse = bodySchema.safeParse(body);
  const userId = parse.success ? parse.data.userId : undefined;

  const { options, challengeKey } = await generatePasskeyAuthenticationOptions(userId);
  return apiSuccess({ options, challengeKey });
});
