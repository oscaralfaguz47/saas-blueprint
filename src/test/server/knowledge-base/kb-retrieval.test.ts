import { describe, it, expect, vi, beforeEach } from "vitest";

import { KbArticleStatus, KbVisibility } from "@prisma/client";

const hoisted = vi.hoisted(() => ({
  generateEmbedding: vi.fn(),
  queryRaw: vi.fn(),
  findMany: vi.fn(),
}));

vi.mock("@/server/ai/ai-provider", () => ({
  generateEmbedding: hoisted.generateEmbedding,
}));

vi.mock("@/server/db", () => ({
  prisma: {
    $queryRaw: hoisted.queryRaw,
    knowledgeBaseChunk: {
      findMany: hoisted.findMany,
    },
  },
}));

describe("retrieveKbChunks", () => {
  beforeEach(() => {
    vi.clearAllMocks();
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
      },
    ]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    const out = await retrieveKbChunks({
      query: "billing help",
      isAuthenticated: true,
      limit: 5,
    });

    expect(hoisted.generateEmbedding).toHaveBeenCalled();
    expect(hoisted.queryRaw).toHaveBeenCalled();
    expect(hoisted.findMany).not.toHaveBeenCalled();
    expect(out).toHaveLength(1);
    expect(out[0].articleSlug).toBe("t");
  });

  it("falls back to keyword search when embedding generation fails", async () => {
    hoisted.generateEmbedding.mockRejectedValue(new Error("no key"));
    hoisted.findMany.mockResolvedValue([
      {
        id: "k1",
        articleId: "a1",
        chunkIndex: 0,
        plainText: "billing text here",
        article: { title: "Doc", slug: "doc" },
      },
    ]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    const out = await retrieveKbChunks({
      query: "billing",
      isAuthenticated: false,
      limit: 5,
    });

    expect(hoisted.findMany).toHaveBeenCalled();
    expect(out).toHaveLength(1);
    const where = hoisted.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.status).toBe(KbArticleStatus.PUBLISHED);
    expect(where.visibility).toEqual({ in: [KbVisibility.PUBLIC] });
  });

  it("enforces authenticated visibility on keyword fallback", async () => {
    hoisted.generateEmbedding.mockRejectedValue(new Error("skip"));
    hoisted.findMany.mockResolvedValue([]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    await retrieveKbChunks({
      query: "something unique",
      isAuthenticated: true,
      limit: 5,
    });

    const where = hoisted.findMany.mock.calls[0][0].where as Record<string, unknown>;
    expect(where.visibility).toEqual({
      in: [KbVisibility.PUBLIC, KbVisibility.AUTHENTICATED],
    });
  });

  it("falls back to keyword search when semantic search returns no rows", async () => {
    hoisted.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0));
    hoisted.queryRaw.mockResolvedValue([]);
    hoisted.findMany.mockResolvedValue([
      {
        id: "k1",
        articleId: "a1",
        chunkIndex: 0,
        plainText: "keyword match text",
        article: { title: "Doc", slug: "doc" },
      },
    ]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    const out = await retrieveKbChunks({
      query: "keyword match",
      isAuthenticated: true,
      limit: 5,
    });

    expect(hoisted.queryRaw).toHaveBeenCalled();
    expect(hoisted.findMany).toHaveBeenCalled();
    expect(out.length).toBeGreaterThan(0);
  });

  it("falls back to keyword search when semantic query throws", async () => {
    hoisted.generateEmbedding.mockResolvedValue(Array.from({ length: 1536 }, () => 0));
    hoisted.queryRaw.mockRejectedValue(new Error('type "vector" does not exist'));
    hoisted.findMany.mockResolvedValue([]);

    const { retrieveKbChunks } = await import("@/server/knowledge-base/kb-retrieval");
    await retrieveKbChunks({
      query: "hello world",
      isAuthenticated: true,
      limit: 5,
    });

    expect(hoisted.findMany).toHaveBeenCalled();
  });
});
