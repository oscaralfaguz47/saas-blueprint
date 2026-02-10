import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { ensureDraftWorkspaceForUser } from "@/server/services/tenancy-bootstrap";
import SetupWorkspaceClient from "./setup-workspace-client";

export const dynamic = "force-dynamic";

export default async function SetupWorkspacePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    redirect(`/auth/sign-in?callbackUrl=${encodeURIComponent("/setup/workspace")}`);
  }

  await ensureDraftWorkspaceForUser({
    userId: session.user.id,
    userEmail: session.user.email ?? undefined,
  });

  return <SetupWorkspaceClient />;
}
