import { getServerSession } from "next-auth";
import { z } from "zod";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { kbCategoryPatchSchema } from "@/lib/validations/kb-admin";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";

const paramsSchema = z.object({ categoryId: z.string().cuid() });

export const PATCH = withErrorHandler(async (req: Request, context: { params: Promise<{ categoryId: string }> }) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { categoryId } = paramsSchema.parse(await context.params);
  const body = await parseBody(req, kbCategoryPatchSchema);

  const existing = await prisma.knowledgeBaseCategory.findUnique({
    where: { id: categoryId },
    select: { id: true },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Category");

  const category = await prisma.knowledgeBaseCategory.update({
    where: { id: categoryId },
    data: {
      ...body,
      updatedByUserId: session.user.id,
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      icon: true,
      isPublished: true,
      sortOrder: true,
      updatedAt: true,
      _count: { select: { articles: true } },
    },
  });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    action: "knowledge_base.category.updated",
    targetType: "KnowledgeBaseCategory",
    targetId: categoryId,
  });

  return apiSuccess({ category });
});

export const DELETE = withErrorHandler(async (_req: Request, context: { params: Promise<{ categoryId: string }> }) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const { categoryId } = paramsSchema.parse(await context.params);

  const existing = await prisma.knowledgeBaseCategory.findUnique({
    where: { id: categoryId },
    select: { _count: { select: { articles: true } } },
  });
  if (!existing) return ApiErrors.NOT_FOUND("Category");
  if (existing._count.articles > 0) {
    return ApiErrors.CONFLICT("Remove or move articles before deleting this category.");
  }

  await prisma.knowledgeBaseCategory.delete({ where: { id: categoryId } });

  await writeAuditLog({
    actorUserId: session.user.id,
    actorContext: "VENDOR",
    action: "knowledge_base.category.deleted",
    targetType: "KnowledgeBaseCategory",
    targetId: categoryId,
  });

  return apiSuccess({ ok: true as const });
});
