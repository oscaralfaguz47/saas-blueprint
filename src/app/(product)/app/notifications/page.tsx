import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { NotificationsInboxClient } from "@/components/app/notifications/notifications-inbox-client";

export const dynamic = "force-dynamic";

export default async function NotificationsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) redirect("/app");

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-(--text-primary)">Notifications</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        All notifications for your account. Quick view also appears in the header bell.
      </p>
      <div className="mt-6">
        <NotificationsInboxClient />
      </div>
    </div>
  );
}
