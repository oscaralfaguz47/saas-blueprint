import "server-only";

import { KbSearchMode } from "@prisma/client";

import { prisma } from "@/server/db";
import { createHash } from "node:crypto";

export async function writeKbSearchLog(params: {
  queryText: string;
  searchMode: KbSearchMode;
  resultCount: number;
  topArticleId?: string | null;
  isAuthenticated: boolean;
  userId?: string | null;
  tenantId?: string | null;
}): Promise<void> {
  const truncated = params.queryText.slice(0, 200);
  const hash = createHash("sha256").update(params.queryText.trim().toLowerCase()).digest("hex");

  await prisma.knowledgeBaseSearchLog.create({
    data: {
      queryTextRedactedOrTruncated: truncated,
      queryHash: hash.slice(0, 64),
      searchMode: params.searchMode,
      resultCount: params.resultCount,
      topArticleId: params.topArticleId ?? null,
      isAuthenticated: params.isAuthenticated,
      userId: params.userId ?? null,
      tenantId: params.tenantId ?? null,
    },
  });
}
