import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockEnv = vi.hoisted(() => ({
  AI_PROVIDER: "openai" as "openai" | "anthropic" | undefined,
  AI_API_KEY: "sk-test",
  EMBEDDING_MODEL: "text-embedding-3-large",
  EMBEDDING_DIMENSIONS: 1536,
}));

vi.mock("@/lib/env", () => ({
  env: mockEnv,
}));

describe("generateEmbedding", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn());
    mockEnv.AI_PROVIDER = "openai";
    mockEnv.AI_API_KEY = "sk-test";
    mockEnv.EMBEDDING_MODEL = "text-embedding-3-large";
    mockEnv.EMBEDDING_DIMENSIONS = 1536;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("calls OpenAI embeddings API with normalized input and model", async () => {
    const emb = Array.from({ length: 1536 }, (_, i) => i / 1536);
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          data: [{ embedding: emb }],
          usage: { total_tokens: 12 },
        }),
        { status: 200 }
      )
    );

    const { generateEmbedding } = await import("@/server/ai/ai-provider");
    const result = await generateEmbedding("  hello   world  ");

    expect(result).toEqual(emb);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [, init] = vi.mocked(fetch).mock.calls[0];
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.model).toBe("text-embedding-3-large");
    expect(body.input).toBe("hello world");
    expect(body.dimensions).toBe(1536);
  });

  it("throws AiProviderError when provider is not OpenAI", async () => {
    mockEnv.AI_PROVIDER = "anthropic";
    const { generateEmbedding, AiProviderError } = await import("@/server/ai/ai-provider");
    await expect(generateEmbedding("test")).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_PROVIDER_UNAVAILABLE",
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps AbortError to AI_EMBEDDING_TIMEOUT (timeout / cancelled fetch)", async () => {
    const abortErr = new Error("Aborted");
    abortErr.name = "AbortError";
    vi.mocked(fetch).mockRejectedValue(abortErr);

    const { generateEmbedding } = await import("@/server/ai/ai-provider");
    await expect(generateEmbedding("hello")).rejects.toMatchObject({
      name: "AiProviderError",
      code: "AI_EMBEDDING_TIMEOUT",
    });
  });
});
