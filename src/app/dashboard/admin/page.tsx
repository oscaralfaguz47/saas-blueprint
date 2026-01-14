import { auth } from "@/server/auth";
import { requireRole } from "@/server/security/authorization";

export default async function AdminPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  requireRole(role, ["ADMIN"]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Admin Area</h1>
      <p className="mt-2">Only ADMIN can see this.</p>
    </main>
  );
}
