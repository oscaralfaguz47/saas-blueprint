import { redirect } from "next/navigation";
import { z } from "zod";

const paramsSchema = z.object({ tenantId: z.string().cuid() });

export const dynamic = "force-dynamic";

/** Members is the default workspace manage view at `/admin/workspaces/[tenantId]`. */
export default async function AdminWorkspaceMembersPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = paramsSchema.parse(await params);
  redirect(`/admin/workspaces/${tenantId}`);
}
