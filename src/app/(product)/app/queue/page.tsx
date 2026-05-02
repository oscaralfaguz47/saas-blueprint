import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { getDefaultTenantForUser } from "@/server/services/tenancy";
import { FinanceQueueClient } from "@/components/app/queue/finance-queue-client";

export const dynamic = "force-dynamic";

export default async function FinanceQueuePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  const membership = await getDefaultTenantForUser(session.user.id);
  if (!membership?.tenant) redirect("/app");

  return (
    <div className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-semibold text-(--text-primary)">Finance queue</h1>
      <p className="mt-1 text-sm text-(--text-muted)">
        Records assigned to you for finance processing.
      </p>
      <div className="mt-6">
        <FinanceQueueClient />
      </div>
    </div>
  );
}
