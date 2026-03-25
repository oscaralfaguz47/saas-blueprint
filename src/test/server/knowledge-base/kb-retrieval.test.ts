import { describe, it, expect, vi, beforeEach } from "vitest";

import { KbArticleStatus, KbVisibility } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  queryRaw: vi.fn(),
  articleFindMany: vi.fn(),
  chunkFindMany: vi.fn(),
}));

vi.mock("@/server/ai/ai-provider", () => ({
  generateEmbedding: hoisted.generateEmbedding,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    $queryRaw: hoisted.queryRaw,
    knowledgeBaseArticle: {
      findMany: hoisted.articleFindMany,
    },
    knowledgeBaseChunk: {
      findMany: hoisted.chunkFindMany,
    },
  },
}));

describe("retrieveKbChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.articleFindMany.mockResolvedValue([]);
    hoisted.chunkFindMany.mockResolvedValue([]);
  });

  it("uses semantic path when embedding succeeds and returns rows", async () => {
    const vec = Array.from({ length: 1536 }, () => 0.01);
    hoisted.generateEmbedding.mockResolvedValue(vec);
    hoisted.queryRaw.mockResolvedValue([
      {
        id: "ch1",
        articleId: "a1",
        chunkIndex: 0,
        plainText: "chunk text",
        tokenCount: 10,
        articleTitle: "T",
        articleSlug: "t",
        similarity: 0.9,
      },
    ]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    const out = await retrieveKbChunks({
      query: "billing help",
      isAuthenticated: true,
      limit: 5,
    });

    expect(hoisted.articleFindMany).toHaveBeenCalled();
    expect(hoisted.generateEmbedding).toHaveBeenCalled();
    expect(hoisted.queryRaw).toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0].articleSlug).toBe("t");
  });

  it("falls back to keyword search when embedding generation fails", async () => {
    hoisted.generateEmbedding.mockRejectedValue(new Error("no key"));
    hoisted.queryRaw.mockResolvedValue([
      {
        id: "k1",
        articleId: "a1",
        chunkIndex: 0,
        plainText: "billing text here",
        tokenCount: 20,
        articleTitle: "Doc",
        articleSlug: "doc",
        rank: 0.1,
      },
    ]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    const out = await retrieveKbChunks({
      query: "billing",
      isAuthenticated: false,
      limit: 5,
    });

    expect(hoisted.queryRaw).toHaveBeenCalled();
    expect(out.length).toBeGreaterThan(0);
    expect(out[0].articleSlug).toBe("doc");
  });

  it("enforces authenticated visibility on keyword fallback", async () => {
    hoisted.generateEmbedding.mockRejectedValue(new Error("skip"));
    hoisted.queryRaw.mockResolvedValue([]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    await retrieveKbChunks({
      query: "something unique keyword",
      isAuthenticated: true,
      limit: 5,
    });

    const keywordCalls = hoisted.queryRaw.mock.calls.filter(
      (c) => String(c[0]).includes("ts_rank")
    );
    expect(keywordCalls.length).toBeGreaterThan(0);
    const firstArg = keywordCalls[0]![0];
    expect(String(firstArg)).toContain("AUTHENTICATED");
  });

  it("falls back to keyword search when semantic search returns no rows", async () => {
    hoisted.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0));
    hoisted.queryRaw
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([
        {
          id: "k1",
          articleId: "a1",
          chunkIndex: 0,
          plainText: "keyword match text",
          tokenCount: 20,
          articleTitle: "Doc",
          articleSlug: "doc",
          rank: 0.1,
        },
      ]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    const out = await retrieveKbChunks({
      query: "keyword match",
      isAuthenticated: true,
      limit: 5,
    });

    expect(hoisted.queryRaw).toHaveBeenCalled();
    expect(out.length).toBeGreaterThan(0);
  });

  it("falls back to keyword search when semantic query throws", async () => {
    hoisted.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0));
    hoisted.queryRaw
      .mockRejectedValueOnce(new Error('type "vector" does not exist'))
      .mockResolvedValueOnce([]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    await retrieveKbChunks({
      query: "hello world",
      isAuthenticated: true,
      limit: 5,
    });

    expect(hoisted.queryRaw.mock.calls.length).toBeGreaterThan(1);
  });

  it("prepends title-matched chunks when article title matches query terms", async () => {
    hoisted.articleFindMany.mockResolvedValue([
      { id: "a1", title: "Enterprise Plan", slug: "enterprise" },
    ]);
    hoisted.chunkFindMany.mockResolvedValue([
      {
        id: "tc1",
        articleId: "a1",
        chunkIndex: 0,
        plainText: "Contact sales for enterprise.",
        tokenCount: 10,
      },
    ]);
    hoisted.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0));
    hoisted.queryRaw.mockResolvedValue([]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    const out = await retrieveKbChunks({
      query: "Enterprise Plan pricing",
      isAuthenticated: false,
      limit: 5,
    });

    expect(hoisted.chunkFindMany).toHaveBeenCalled();
    expect(out.some((c) => c.id === "tc1")).toBe(true);
  });
});
