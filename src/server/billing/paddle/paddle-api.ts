import "server-only";

export const PADDLE_API_BASE =
  process.env.PADDLE_ENVIRONMENT === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

export function getPaddleApiKey(): string {
  const key = process.env.PADDLE_API_KEY;
  if (!key) throw new Error("PADDLE_API_KEY is not set");
  return key;
}
