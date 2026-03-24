import { getServerSession } from "next-auth";
import { KbArticleStatus, KbVisibility } from "@prisma/client";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { getCurrentTenantId } from "@/server/billing/tenant-context";
import { prisma } from "@/server/db";
import { runKbAiAnswer } from "@/server/knowledge-base/kb-ai-answer";
import { requireFullSession } from "@/server/require-full-session";
import { checkKbAiAnswerLimitUser } from "@/server/support/support-rate-limits";

const bodySchema = z.object({
  query: z.string().min(2).max(500),
});

const MAX_BODY = 1024;

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkKbAiAnswerLimitUser(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many AI requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const tenantId = await getCurrentTenantId({ session, req });
  if (!tenantId) return ApiErrors.NO_TENANT();

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
    isAuthenticated: true,
    userId: session.user.id,
    tenantId,
  });

  const citedArticles =
    result.citedArticleIds.length > 0
      ? await prisma.knowledgeBaseArticle.findMany({
          where: {
            id: { in: result.citedArticleIds },
            status: KbArticleStatus.PUBLISHED,
            visibility: { in: [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED] },
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
