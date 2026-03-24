import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { getClientIp } from "@/server/http-client-ip";
import { prisma } from "@/server/db";
import { checkKbAiAnswerLimit } from "@/server/support/support-rate-limits";

const bodySchema = z.object({
  visitorEmail: z.string().email().max(255).optional(),
});

const MAX_BODY = 512;

export const POST = withErrorHandler(async (req: Request) => {
  const ip = getClientIp(req);
  const rl = await checkKbAiAnswerLimit(ip);
  if (!rl.allowed) {
    return ApiErrors.RATE_LIMITED("Too many requests", {
      retryAfterSeconds: rl.retryAfterSeconds,
    });
  }

  const ct = req.headers.get("content-type") ?? "";
  if (!ct.toLowerCase().includes("application/json")) {
    return ApiErrors.UNSUPPORTED_MEDIA_TYPE();
  }

  const buf = new Uint8Array(await req.arrayBuffer());
  if (buf.byteLength > MAX_BODY) {
    return ApiErrors.PAYLOAD_TOO_LARGE();
  }

  let json: unknown;
  try {
    json = JSON.parse(new TextDecoder().decode(buf));
  } catch {
    return ApiErrors.VALIDATION_ERROR("Invalid JSON");
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return ApiErrors.VALIDATION_ERROR("Invalid request body");
  }

  const session = await prisma.aiChatSession.create({
    data: {
      isAuthenticated: false,
      visitorEmail: parsed.data.visitorEmail?.trim() ?? null,
    },
    select: { id: true },
  });

  return apiSuccess({ sessionId: session.id }, 201);
});
