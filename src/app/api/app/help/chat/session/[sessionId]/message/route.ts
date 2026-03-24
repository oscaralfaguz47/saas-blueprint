import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId } from "@/server/billing/tenant-context";
import { executeAiChatMessage } from "@/server/help/ai-chat-persist";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { checkKbAiAnswerLimitUser } from "@/server/support/support-rate-limits";

const bodySchema = z.object({
  query: z.string().min(2).max(500),
});

const MAX_BODY = 1024;

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ sessionId: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) {
    return ApiErrors.FORBIDDEN();
  }

  const rl = await checkKbAiAnswerLimitUser(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

  const rawParams = await context.params;
  const sessionIdParse = z.string().cuid().safeParse(rawParams.sessionId);
  if (!sessionIdParse.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid session");
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return ApiErrors.UNSUPPORTED_MEDIA_TYPE();
  }

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > MAX_BODY) {
    return ApiErrors.PAYLOAD_TOO_LARGE();
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid JSON");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const chatSession = await prisma.aiChatSession.findFirst({
    where: {
      id: sessionIdParse.data,
      isAuthenticated: true,
      userId: session.user.id,
      tenantId,
    },
    select: { id: true },
  });
  if (!chatSession) {
    return ApiErrors.NOT_FOUND();
  }

  const query = parsed.data.query.trim();
  const out = await executeAiChatMessage({
    sessionId: chatSession.id,
    query,
    isAuthenticated: true,
    userId: session.user.id,
    tenantId,
  });

  return apiSuccess({
    aiAnswer: out.aiAnswer,
    citedArticleIds: out.citedArticleIds,
    citedArticles: out.citedArticles,
    resultCount: out.resultCount,
    sessionId: chatSession.id,
  });
});
