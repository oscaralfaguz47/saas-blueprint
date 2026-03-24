import "server-only";

import { env } from "@/lib/env";

export class AiProviderError extends Error {
  readonly code: string;
  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = "AiProviderError";
    this.code = code;
  }
}

export type ChatCompletionParams = {
  systemPrompt: string;
  userMessage: string;
  maxTokens: number;
  timeoutMs: number;
};

type OpenAiErrorBody = { error?: { message?: string; code?: string; type?: string } };

const EMBEDDING_TIMEOUT_MS = 10_000;

function normalizeEmbeddingInput(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

/**
 * Generates a single embedding vector for the given text.
 * Uses OpenAI `text-embedding-3-small` (1536 dims) by default via env.
 * Enforces explicit timeout. Throws {@link AiProviderError} on failure.
 * Never logs input text or vectors — only success token counts or failure (no payload).
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const provider = env.AI_PROVIDER;
  const apiKey = env.AI_API_KEY?.trim();
  const embeddingModel = env.EMBEDDING_MODEL?.trim() || "text-embedding-3-small";
  const dimensions = env.EMBEDDING_DIMENSIONS ?? 1536;

  if (provider !== "openai" || !apiKey) {
    throw new AiProviderError("AI_PROVIDER_UNAVAILABLE");
  }

  const input = normalizeEmbeddingInput(text);
  if (!input) {
    throw new AiProviderError("AI_PROVIDER_UNAVAILABLE");
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMBEDDING_TIMEOUT_MS);

  try {
    console.log("[ai-provider] embedding_request", {
      model: embeddingModel,
      inputLength: input.length,
      inputPreview: input.slice(0, 80),
      keyPrefix: env.AI_API_KEY?.slice(0, 10) ?? "MISSING",
    });

    const res = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: embeddingModel,
        input,
        dimensions,
      }),
      signal: controller.signal,
    });

    if (!res.ok) {
      let errorBody: OpenAiErrorBody | null = null;
      try {
        errorBody = (await res.json()) as OpenAiErrorBody;
      } catch {
        errorBody = null;
      }
      console.error("[ai-provider] embedding_error", {
        httpStatus: res.status,
        errorMessage: errorBody?.error?.message ?? "unknown",
        errorCode: errorBody?.error?.code ?? "unknown",
        errorType: errorBody?.error?.type ?? "unknown",
      });
      throw new AiProviderError("AI_PROVIDER_UNAVAILABLE");
    }

    const json = (await res.json()) as {
      data?: Array<{ embedding?: number[] }>;
      usage?: { total_tokens?: number };
    };

    const embedding = json.data?.[0]?.embedding;
    if (!embedding?.length) {
      throw new AiProviderError("AI_PROVIDER_UNAVAILABLE");
    }

    if (embedding.length !== dimensions) {
      throw new AiProviderError("AI_PROVIDER_UNAVAILABLE");
    }

    const totalTokens = json.usage?.total_tokens ?? 0;
    console.log("[ai-provider] embedding_response", {
      model: embeddingModel,
      totalTokens,
      vectorLength: embedding.length,
      vectorPreview: embedding.slice(0, 3),
      httpStatus: res.status,
    });

    return embedding;
  } catch (e) {
    if (e instanceof AiProviderError) throw e;
    if (e instanceof Error && e.name === "AbortError") {
      throw new AiProviderError("AI_EMBEDDING_TIMEOUT", "Embedding request timed out");
    }
    throw new AiProviderError("AI_PROVIDER_UNAVAILABLE");
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Chat completion — returns plain text. Enforces timeout; throws on failure.
 */
export async function chatCompletion(params: ChatCompletionParams): Promise<string> {
  const provider = env.AI_PROVIDER;
  const apiKey = env.AI_API_KEY?.trim();
  const chatModel = env.AI_MODEL?.trim() || "gpt-4o-mini";
  const defaultMax = env.AI_MAX_TOKENS ?? 512;

  if (!provider || !apiKey) {
    const err = new Error("AI_PROVIDER_UNAVAILABLE");
    err.name = "AiProviderError";
    throw err;
  }

  const maxTokens = Math.min(params.maxTokens, defaultMax);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), params.timeoutMs);

  try {
    if (provider === "openai") {
      console.log("[ai-provider] chat_request", {
        model: chatModel,
        systemPromptLength: params.systemPrompt.length,
        userMessageLength: params.userMessage.length,
        maxTokens: params.maxTokens,
        keyPrefix: env.AI_API_KEY?.slice(0, 10) ?? "MISSING",
      });

      const res = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: chatModel,
          messages: [
            { role: "system", content: params.systemPrompt },
            { role: "user", content: params.userMessage },
          ],
          max_tokens: maxTokens,
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        let errorBody: OpenAiErrorBody | null = null;
        try {
          errorBody = (await res.json()) as OpenAiErrorBody;
        } catch {
          errorBody = null;
        }
        console.error("[ai-provider] chat_error", {
          httpStatus: res.status,
          errorMessage: errorBody?.error?.message ?? "unknown",
          errorCode: errorBody?.error?.code ?? "unknown",
          errorType: errorBody?.error?.type ?? "unknown",
        });
        const err = new Error("AI_PROVIDER_UNAVAILABLE");
        err.name = "AiProviderError";
        throw err;
      }
      const json = (await res.json()) as {
        choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }>;
        usage?: { total_tokens?: number };
      };
      const choice = json.choices?.[0];
      const text = choice?.message?.content?.trim();
      if (!text) {
        const err = new Error("AI_PROVIDER_UNAVAILABLE");
        err.name = "AiProviderError";
        throw err;
      }
      console.log("[ai-provider] chat_response", {
        model: chatModel,
        totalTokens: json.usage?.total_tokens ?? 0,
        responseLength: text.length,
        httpStatus: res.status,
        finishReason: choice?.finish_reason ?? null,
      });
      return text;
    }

    if (provider === "anthropic") {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: chatModel,
          max_tokens: maxTokens,
          system: params.systemPrompt,
          messages: [{ role: "user", content: params.userMessage }],
        }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const err = new Error("AI_PROVIDER_UNAVAILABLE");
        err.name = "AiProviderError";
        throw err;
      }
      const json = (await res.json()) as {
        content?: Array<{ type?: string; text?: string }>;
      };
      const block = json.content?.find((c) => c.type === "text");
      const text = block?.text?.trim();
      if (!text) {
        const err = new Error("AI_PROVIDER_UNAVAILABLE");
        err.name = "AiProviderError";
        throw err;
      }
      return text;
    }

    const err = new Error("AI_PROVIDER_UNAVAILABLE");
    err.name = "AiProviderError";
    throw err;
  } finally {
    clearTimeout(timer);
  }
}
