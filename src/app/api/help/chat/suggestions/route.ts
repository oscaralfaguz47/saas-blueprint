import { KbArticleStatus, KbVisibility } from "@prisma/client";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { getClientIp } from "@/server/http-client-ip";
import { prisma } from "@/server/db";
import { checkKbSearchLimit } from "@/server/support/support-rate-limits";

export const GET = withErrorHandler(async (req: Request) => {
  const ip = getClientIp(req);
  const rl = await checkKbSearchLimit(ip);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const rows = await prisma.knowledgeBaseArticle.findMany({
    where: {
      status: KbArticleStatus.PUBLISHED,
      visibility: KbVisibility.PUBLIC,
    },
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: { title: true },
  });

  return apiSuccess({ titles: rows.map((r) => r.title) });
});
