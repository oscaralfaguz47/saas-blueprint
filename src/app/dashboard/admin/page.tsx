import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/signin");

  const ok = await hasVendorPermission({
    userId: session.user.id,
    legacyRole: session.user.role,
    permission: "admin.tenants.read",
  });

  if (!ok) redirect("/unauthorized");

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Admin Area</h1>
      <p className="mt-2">Vendor Admin Access (permissions-based).</p>
    </main>
  );
}
