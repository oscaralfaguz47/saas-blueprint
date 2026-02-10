import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { SlugTakenError, claimWorkspaceBySlug } from "@/server/services/tenancy-bootstrap";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody, claimWorkspaceSchema } from "@/lib/validations";

function getIp(req: Request): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
}

function getUserAgent(req: Request): string | null {
  return req.headers.get("user-agent") ?? null;
}

/** POST /api/workspaces/claim — A5: claim DRAFT workspace with chosen slug */
export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, isPlatformBlocked: true },
  });
  if (!user) return ApiErrors.UNAUTHENTICATED();
  if (user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const body = await parseBody(req, claimWorkspaceSchema);

  try {
    const result = await claimWorkspaceBySlug({
      userId: session.user.id,
      slug: body.slug,
      ipAddress: getIp(req),
      userAgent: getUserAgent(req),
    });
    return apiSuccess({ tenant: result.tenant });
  } catch (err) {
    if (err instanceof SlugTakenError) {
      return ApiErrors.CONFLICT(err.message, { code: "SLUG_TAKEN", slug: err.slug });
    }
    const code = err && typeof err === "object" && "code" in err ? (err as { code?: string }).code : undefined;
    if (code === "NO_DRAFT_WORKSPACE") {
      return ApiErrors.NOT_FOUND("No draft workspace found to claim");
    }
    throw err;
  }
});
