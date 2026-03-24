import { z } from "zod";
import { KbArticleStatus, KbVisibility } from "@prisma/client";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { prisma } from "@/server/db";
import { runKbAiAnswer } from "@/server/knowledge-base/kb-ai-answer";
import { getClientIp } from "@/server/http-client-ip";
import { checkKbAiAnswerLimit } from "@/server/support/support-rate-limits";

const bodySchema = z.object({
  query: z.string().min(2).max(500),
});

const MAX_BODY = 1024;

export const POST = withErrorHandler(async (req: Request) => {
  const ip = getClientIp(req);
  const rl = await checkKbAiAnswerLimit(ip);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many AI requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
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

  const result = await runKbAiAnswer({
    query: parsed.data.query.trim(),
    isAuthenticated: false,
    userId: null,
    tenantId: null,
  });

  const citedArticles =
    result.citedArticleIds.length > 0
      ? await prisma.knowledgeBaseArticle.findMany({
          where: {
            id: { in: result.citedArticleIds },
            status: KbArticleStatus.PUBLISHED,
            visibility: { in: [KbVisibility.PUBLIC] },
          },
          select: { id: true, title: true, slug: true },
          orderBy: { title: "asc" },
        })
      : [];

  return apiSuccess({
    aiAnswer: result.aiAnswer,
    citedArticleIds: result.citedArticleIds,
    citedArticles,
    resultCount: result.resultCount,
  });
});
