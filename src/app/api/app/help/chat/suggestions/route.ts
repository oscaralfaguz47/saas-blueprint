import { getServerSession } from "next-auth";
import { KbArticleStatus, KbVisibility } from "@prisma/client";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { checkKbSearchLimitUser } from "@/server/support/support-rate-limits";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const rl = await checkKbSearchLimitUser(session.user.id);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const rows = await prisma.knowledgeBaseArticle.findMany({
    where: {
      status: KbArticleStatus.PUBLISHED,
      visibility: { in: [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED] },
    },
    orderBy: { updatedAt: "desc" },
    take: 3,
    select: { title: true },
  });

  return apiSuccess({ titles: rows.map((r) => r.title) });
});
