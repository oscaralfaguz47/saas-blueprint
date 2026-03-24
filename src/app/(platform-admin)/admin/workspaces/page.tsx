import { getServerSession } from "next-auth";

import { WorkspacesListClient } from "@/components/app/admin/workspaces-list-client";
import { authOptions } from "@/server/auth-options";
import { requireFullSessionRsc } from "@/server/require-full-session-rsc";

export const dynamic = "force-dynamic";

export default async function AdminWorkspacesPage() {
  const session = await getServerSession(authOptions);
  await requireFullSessionRsc(session);

  return <WorkspacesListClient />;
}
