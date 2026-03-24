import "server-only";

import {
  AiChatMessageRole,
  KbArticleStatus,
  KbVisibility,
} from "@prisma/client";

import { prisma } from "@/server/db";
import { runKbAiAnswer } from "@/server/knowledge-base/kb-ai-answer";

export async function executeAiChatMessage(params: {
  sessionId: string;
  query: string;
  isAuthenticated: boolean;
  userId: string | null;
  tenantId: string | null;
}): Promise<{
  aiAnswer: string | null;
  citedArticleIds: string[];
  citedArticles: { id: string; title: string; slug: string }[];
  resultCount: number;
}> {
  const result = await runKbAiAnswer({
    query: params.query,
    isAuthenticated: params.isAuthenticated,
    userId: params.userId,
    tenantId: params.tenantId,
  });

  const vis = params.isAuthenticated
    ? [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED]
    : [KbVisibility.PUBLIC];

  const citedArticles =
    result.citedArticleIds.length > 0
      ? await prisma.knowledgeBaseArticle.findMany({
          where: {
            id: { in: result.citedArticleIds },
            status: KbArticleStatus.PUBLISHED,
            visibility: { in: vis },
          },
          select: { id: true, title: true, slug: true },
          orderBy: { title: "asc" },
        })
      : [];

  const assistantText = result.aiAnswer?.trim() ? result.aiAnswer : "";

  await prisma.$transaction([
    prisma.aiChatMessage.create({
      data: {
        sessionId: params.sessionId,
        role: AiChatMessageRole.USER,
        content: params.query,
        citedArticleIds: [],
      },
    }),
    prisma.aiChatMessage.create({
      data: {
        sessionId: params.sessionId,
        role: AiChatMessageRole.ASSISTANT,
        content: assistantText,
        citedArticleIds: result.citedArticleIds,
      },
    }),
    prisma.aiChatSession.update({
      where: { id: params.sessionId },
      data: { messageCount: { increment: 2 } },
    }),
  ]);

  // Never log message body — diagnostic metadata only.
  console.log("[ai-chat] exchange_stored", {
    sessionId: params.sessionId,
    resultCount: result.resultCount,
    citedCount: result.citedArticleIds.length,
  });

  return {
    aiAnswer: result.aiAnswer,
    citedArticleIds: result.citedArticleIds,
    citedArticles,
    resultCount: result.resultCount,
  };
}
