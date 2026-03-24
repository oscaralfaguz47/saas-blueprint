import { getServerSession } from "next-auth";

import { ApiErrors, apiSuccess, withErrorHandler } from "@/lib/api-response";
import { parseBody } from "@/lib/validations";
import { kbCategoryCreateSchema } from "@/lib/validations/kb-admin";
import { authOptions } from "@/server/auth-options";
import { prisma } from "@/server/db";
import { requireAdminAuth } from "@/server/security/admin-route-auth";
import { writeAuditLog } from "@/server/services/audit";

export const GET = withErrorHandler(async () => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.read");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const categories = await prisma.knowledgeBaseCategory.findMany({
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
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

  return apiSuccess({ categories });
});

export const POST = withErrorHandler(async (req: Request) => {
  const session = await getServerSession(authOptions);
  const authError = await requireAdminAuth(session, "admin.knowledge_base.manage");
  if (authError) return authError;
  if (!session?.user?.id) return ApiErrors.UNAUTHENTICATED();

  const body = await parseBody(req, kbCategoryCreateSchema);

  const category = await prisma.knowledgeBaseCategory.create({
    data: {
      name: body.name,
      slug: body.slug,
      description: body.description ?? null,
      icon: body.icon ?? null,
      sortOrder: body.sortOrder,
      isPublished: body.isPublished,
      createdByUserId: session.user.id,
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
    action: "knowledge_base.category.created",
    targetType: "KnowledgeBaseCategory",
    targetId: category.id,
  });

  return apiSuccess({ category }, 201);
});
