import "server-only";

import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireFullSession } from "@/server/require-full-session";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { hasTenantPermission } from "@/server/security/tenant-authorization";
import { canAccessRequest } from "@/server/security/request-authorization";
import { processMentions } from "@/server/services/record-mentions";
import { getPresignedGetUrlProfilePhoto, isR2Configured } from "@/server/services/r2-profile-photo";
import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { z } from "zod";

const paramsSchema = z.object({ id: z.string().cuid() });

const addCommentSchema = z.object({
  content: z
    .string()
    .min(1, "Comment cannot be empty")
    .max(5000, "Comment too long")
    .trim(),
  commentScope: z.enum(["GENERAL", "APPROVAL", "PAYMENT"]).default("GENERAL"),
});

/**
 * GET /api/records/[id]/comments
 * List comments for a record, ordered oldest first.
 */
export const GET = withErrorHandler(async (
  _req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid record id");
  const { id: recordId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const comments = await prisma.recordComment.findMany({
    where: { recordId, tenantId },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      authorType: true,
      authorUserId: true,
      authorEmail: true,
      commentScope: true,
      content: true,
      isCritical: true,
      createdAt: true,
    },
  });

  // Batch fetch author data for internal comments
  const authorIds = [
    ...new Set(
      comments
        .filter((c) => c.authorType === "INTERNAL" && c.authorUserId)
        .map((c) => c.authorUserId!)
    ),
  ];

  const authors =
    authorIds.length > 0
      ? await prisma.user.findMany({
          where: { id: { in: authorIds } },
          select: { id: true, name: true, email: true, image: true, profilePhotoObjectKey: true },
        })
      : [];

  const authorMap = new Map(authors.map((u) => [u.id, u]));
  const r2Available = isR2Configured();

  const enriched = await Promise.all(
    comments.map(async (c) => {
      const author = c.authorUserId ? authorMap.get(c.authorUserId) : null;
      let authorAvatarUrl: string | null = null;
      if (author?.profilePhotoObjectKey && r2Available) {
        authorAvatarUrl = await getPresignedGetUrlProfilePhoto(author.profilePhotoObjectKey);
      }
      if (!authorAvatarUrl) authorAvatarUrl = author?.image ?? null;

      return {
        id: c.id,
        authorType: c.authorType,
        authorUserId: c.authorUserId,
        authorEmail: author?.email ?? c.authorEmail ?? null,
        authorName: author?.name ?? null,
        authorAvatarUrl,
        commentScope: c.commentScope,
        content: c.content,
        isCritical: c.isCritical,
        createdAt: c.createdAt.toISOString(),
      };
    })
  );

  return apiSuccess({ comments: enriched });
});

/**
 * POST /api/records/[id]/comments
 * F1 — Add a comment. Requires C1 access + tenant.requests.comment.
 * F3 — Mentions processed after commit (best-effort).
 */
export const POST = withErrorHandler(async (
  req: Request,
  context: { params: Promise<{ id: string }> }
) => {
  const session = await getServerSession(authOptions);
  const mfaError = await requireFullSession(session);
  if (mfaError) return mfaError;
  if (!session?.user) return ApiErrors.UNAUTHENTICATED();

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { isPlatformBlocked: true },
  });
  if (!user || user.isPlatformBlocked) return ApiErrors.FORBIDDEN();

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) return ApiErrors.NO_TENANT();
  const tenantId = membership.tenant.id;

  const parseResult = paramsSchema.safeParse(await context.params);
  if (!parseResult.success) return ApiErrors.VALIDATION_ERROR("Invalid record id");
  const { id: recordId } = parseResult.data;

  const hasAccess = await canAccessRequest({
    tenantId,
    userId: session.user.id,
    requestId: recordId,
  });
  if (!hasAccess) return ApiErrors.NOT_FOUND("Record");

  const canComment = await hasTenantPermission({
    userId: session.user.id,
    tenantId,
    permission: "tenant.requests.comment",
  });
  if (!canComment) return ApiErrors.FORBIDDEN();

  const record = await prisma.record.findFirst({
    where: { id: recordId, tenantId },
    select: { status: true },
  });
  if (!record) return ApiErrors.NOT_FOUND("Record");
  if (record.status === "CLOSED") {
    return ApiErrors.CONFLICT("Cannot add comments to a closed record.");
  }

  const rawBody = await req.json().catch(() => null);
  if (!rawBody) return ApiErrors.VALIDATION_ERROR("Invalid request body");
  const bodyResult = addCommentSchema.safeParse(rawBody);
  if (!bodyResult.success) {
    return ApiErrors.VALIDATION_ERROR("Validation failed", bodyResult.error.flatten());
  }
  const { content, commentScope } = bodyResult.data;

  const comment = await prisma.$transaction(async (tx) => {
    const c = await tx.recordComment.create({
      data: {
        tenantId,
        recordId,
        authorType: "INTERNAL",
        authorUserId: session.user.id,
        commentScope,
        content,
        isCritical: false,
      },
      select: {
        id: true,
        commentScope: true,
        content: true,
        isCritical: true,
        createdAt: true,
      },
    });

    await tx.recordEvent.create({
      data: {
        tenantId,
        recordId,
        eventType: "COMMENT_ADDED",
        actorUserId: session.user.id,
        metadata: {
          commentId: c.id,
          commentScope,
          authorType: "INTERNAL",
        },
      },
    });

    return c;
  });

  try {
    await processMentions({
      tenantId,
      recordId,
      commentId: comment.id,
      content,
      actorUserId: session.user.id,
    });
  } catch (err) {
    console.error("[comments] mention processing failed", err);
  }

  return apiSuccess(comment, 201);
});
