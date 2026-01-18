import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import { hasVendorPermission } from "@/server/security/vendor-authorization";

export default async function ManagerPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/signin");

  const ok = await hasVendorPermission({
    userId: session.user.id,
    legacyRole: session.user.role,
    permission: "admin.users.read",
  });

  if (!ok) redirect("/unauthorized");

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Manager Area</h1>
      <p className="mt-2">Support/Admin Ops Access (permissions-based).</p>
    </main>
  );
}
