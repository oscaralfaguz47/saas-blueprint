import { z } from "zod";

import { apiError, ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { executeAiChatMessage } from "@/server/help/ai-chat-persist";
import { getClientIp } from "@/server/http-client-ip";
import { prisma } from "@/server/db";
import { checkKbAiAnswerLimit } from "@/server/support/support-rate-limits";

const bodySchema = z.object({
  query: z.string().min(2).max(500),
  visitorEmail: z.string().email().max(255).optional(),
});

const MAX_BODY = 1024;

export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ sessionId: string }> }
) => {
  const ip = getClientIp(req);
  const rl = await checkKbAiAnswerLimit(ip);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const rawParams = await context.params;
  const sessionId = z.string().cuid().safeParse(rawParams.sessionId);
  if (!sessionId.success) {
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

  const session = await prisma.aiChatSession.findFirst({
    where: { id: sessionId.data, isAuthenticated: false },
    select: { id: true, visitorEmail: true },
  });
  if (!session) {
    return ApiErrors.NOT_FOUND();
  }

  const fromBody = parsed.data.visitorEmail?.trim() ?? null;
  const resolvedEmail = fromBody || session.visitorEmail;
  if (!resolvedEmail) {
    return apiError("VISITOR_EMAIL_REQUIRED", 400, "Visitor email is required to continue");
  }

  if (session.visitorEmail !== resolvedEmail) {
    await prisma.aiChatSession.update({
      where: { id: session.id },
      data: { visitorEmail: resolvedEmail },
    });
  }

  const query = parsed.data.query.trim();
  const out = await executeAiChatMessage({
    sessionId: session.id,
    query,
    isAuthenticated: false,
    userId: null,
    tenantId: null,
  });

  return apiSuccess({
    aiAnswer: out.aiAnswer,
    citedArticleIds: out.citedArticleIds,
    citedArticles: out.citedArticles,
    resultCount: out.resultCount,
    sessionId: session.id,
  });
});
