import { describe, it, expect, vi, beforeEach } from "vitest";

import { KbArticleStatus, KbVisibility } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  findUnique: vi.fn(),
  deleteMany: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  transaction: vi.fn(),
  executeRaw: vi.fn(),
}));

vi.mock("@/server/ai/ai-provider", () => ({
  generateEmbedding: hoisted.generateEmbedding,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    knowledgeBaseArticle: {
      findUnique: hoisted.findUnique,
      update: hoisted.update,
    },
    $transaction: hoisted.transaction,
    $executeRaw: hoisted.executeRaw,
  },
}));

describe("indexKbArticle", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.findUnique.mockResolvedValue({
      id: "art1",
      status: KbArticleStatus.PUBLISHED,
      bodyMarkdown: "Hello world. ".repeat(20),
      visibility: KbVisibility.PUBLIC,
    });
    hoisted.transaction.mockImplementation(async (fn: (tx: unknown) => Promise<void>) => {
      const tx = {
        knowledgeBaseChunk: {
          deleteMany: hoisted.deleteMany,
          create: hoisted.create,
        },
      };
      await fn(tx);
    });
    hoisted.create.mockResolvedValue({ id: "chunk-1", plainText: "hello" });
    hoisted.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, (_, i) => i / 1536));
    hoisted.executeRaw.mockResolvedValue(1);
    hoisted.update.mockResolvedValue({});
  });

  it("stores embedding via raw SQL after successful embedding", async () => {
    const { indexKbArticle } = await import("@/server/knowledge-base/kb-indexer");
    await indexKbArticle("art1");

    expect(hoisted.generateEmbedding).toHaveBeenCalled();
    expect(hoisted.executeRaw).toHaveBeenCalled();
    expect(hoisted.update).toHaveBeenCalledWith({
      where: { id: "art1" },
      data: { lastIndexedAt: expect.any(Date) },
    });
  });

  it("continues when embedding generation fails", async () => {
    hoisted.generateEmbedding.mockRejectedValueOnce(new Error("AI_PROVIDER_UNAVAILABLE"));

    const { indexKbArticle } = await import("@/server/knowledge-base/kb-indexer");
    await expect(indexKbArticle("art1")).resolves.toBeUndefined();

    expect(hoisted.executeRaw).not.toHaveBeenCalled();
    expect(hoisted.update).toHaveBeenCalledWith({
      where: { id: "art1" },
      data: { lastIndexedAt: expect.any(Date) },
    });
  });
});
