import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { requireVendorPermission } from "@/server/security/platform-authorization";

export default async function AdminHomePage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/auth/sign-in");

  // Require vendor-level permission (platform)
  await requireVendorPermission({
    userId: session.user.id,
    legacyRole: session.user.role, // fallback until you stop using User.role
    permission: "admin.tenants.read",
  });

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Platform Admin</h1>
      <p className="mt-2">You have access to the admin panel.</p>
    </main>
  );
}
