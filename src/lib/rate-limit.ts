import "server-only";

import { prisma } from "@/server/db";
import { logRateLimited } from "@/server/security-log";

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds: number;
}

/**
 * DB-backed distributed rate limiter. Safe for multi-instance serverless deployments.
 *
 * @param key      - Unique key identifying the actor+action (e.g. "2fa:verify:userId")
 * @param max      - Maximum number of requests allowed in the window
 * @param windowMs - Window duration in milliseconds
 *
 * Note: Expired rows accumulate in this table; run periodic cleanup of rows where
 * resetAt is in the past (e.g. cron) to keep the table small — not implemented here.
 */
export async function checkRateLimit(
  key: string,
  max: number,
  windowMs: number
): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  try {
    const result = await prisma.$transaction(async (tx) => {
      const existing = await tx.rateLimit.findUnique({ where: { key } });

      if (!existing || existing.resetAt <= now) {
        await tx.rateLimit.upsert({
          where: { key },
          create: { key, count: 1, resetAt },
          update: { count: 1, resetAt },
        });
        return { allowed: true, retryAfterSeconds: 0 };
      }

      if (existing.count >= max) {
        const retryAfterSeconds = Math.ceil(
          (existing.resetAt.getTime() - now.getTime()) / 1000
        );
        logRateLimited({
          key,
          userId: null,
          tenantId: null,
          ip: null,
          path: null,
        });
        return { allowed: false, retryAfterSeconds };
      }

      await tx.rateLimit.update({
        where: { key },
        data: { count: { increment: 1 } },
      });
      return { allowed: true, retryAfterSeconds: 0 };
    });

    return result;
  } catch {
    // Fail closed: avoid cost/abuse exposure when rate-limit storage is unavailable.
    console.error("[rate-limit] DB check failed, failing closed for key:", key);
    return { allowed: false, retryAfterSeconds: 60 };
  }
}
