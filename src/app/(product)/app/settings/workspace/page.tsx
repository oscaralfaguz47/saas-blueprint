import { Suspense } from "react";
import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { prisma } from "@/server/db";
import { Container } from "@/components/ui/container";
import Link from "next/link";
import { WorkspaceSettingsTabs } from "@/components/app/settings/workspace-settings-tabs";
import { Spinner } from "@/components/ui/spinner";

export default async function WorkspaceSettingsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  const tenantId = membership?.tenantId;
  if (!tenantId) {
    return (
      <Container>
        <div className="space-y-4">
          <h1 className="text-xl font-semibold text-(--text-primary)">
            Workspace Settings
          </h1>
          <p className="text-sm text-(--text-secondary)">
            Create or select a workspace to manage settings.
          </p>
          <Link
            href="/app"
            className="inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
          >
            Go to app
          </Link>
        </div>
      </Container>
    );
  }

  const tenant = await prisma.tenant.findUnique({
    where: { id: tenantId },
    select: {
      id: true,
      name: true,
      slug: true,
      status: true,
      logoObjectKey: true,
      timezone: true,
      currency: true,
      dateFormat: true,
      description: true,
    },
  });
  if (!tenant) {
    return (
      <Container>
        <p className="text-sm text-(--text-secondary)">Workspace not found.</p>
      </Container>
    );
  }

  return (
    <Suspense
      fallback={
        <Container>
          <div className="flex items-center gap-2 py-8">
            <Spinner size="sm" />
            <span className="text-sm text-(--text-muted)">Loading settings…</span>
          </div>
        </Container>
      }
    >
      <WorkspaceSettingsTabs tenant={tenant} />
    </Suspense>
  );
}
