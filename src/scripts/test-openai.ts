import fs from "node:fs";
import path from "node:path";

function loadDotEnvFromRoot(): void {
  const envPath = path.resolve(process.cwd(), ".env");
  if (!fs.existsSync(envPath)) return;
  const raw = fs.readFileSync(envPath, "utf8");
  for (const line of raw.split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const idx = t.indexOf("=");
    if (idx <= 0) continue;
    const key = t.slice(0, idx).trim();
    let value = t.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

async function main() {
  loadDotEnvFromRoot();

  const { generateEmbedding, chatCompletion } = await import("@/server/ai/ai-provider");

  const emb = await generateEmbedding("test connection");
  console.log("[test-openai] embedding.length =", emb.length);
  console.log("[test-openai] embedding.first5 =", emb.slice(0, 5));

  const reply = await chatCompletion({
    systemPrompt: "You are a concise assistant.",
    userMessage: "Say hello",
    maxTokens: 64,
    timeoutMs: 15_000,
  });
  console.log("[test-openai] chat reply =", reply);
}

main().catch((err) => {
  console.error("[test-openai] error");
  console.error(err);
  process.exit(1);
});
