import "server-only";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { randomBytes, createHash } from "node:crypto";
import { z } from "zod";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";

const INTENT_TTL_MS = 5 * 60 * 1000; // 5 minutes

const BodySchema = z.object({
  provider: z.enum(["azure-ad", "google"]),
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return ApiErrors.UNAUTHENTICATED();
  }
  if (session.user.authLevel !== "FULL") {
    return ApiErrors.FORBIDDEN();
  }

  const body = await req.json().catch(() => null);
  const parse = BodySchema.safeParse(body);
  if (!parse.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid provider");
  }

  const { provider } = parse.data;
  const userId = session.user.id;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { email: true },
  });
  if (!user?.email) {
    return ApiErrors.VALIDATION_ERROR("User email not found");
  }

  const expectedEmail = user.email.trim().toLowerCase();

  await prisma.accountLinkIntent.updateMany({
    where: { userId, targetProvider: provider },
    data: { errorCode: null },
  });

  await prisma.accountLinkIntent.deleteMany({
    where: { userId, targetProvider: provider, consumedAt: null },
  });

  const rawToken = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(rawToken).digest("hex");
  const expiresAt = new Date(Date.now() + INTENT_TTL_MS);

  await prisma.accountLinkIntent.create({
    data: { userId, targetProvider: provider, expectedEmail, tokenHash, expiresAt },
  });

  return apiSuccess({ token: rawToken });
});
