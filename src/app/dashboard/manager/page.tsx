import { auth } from "@/server/auth";
import { requireRole } from "@/server/security/authorization";

export default async function ManagerPage() {
  const session = await auth();
  const role = (session?.user as any)?.role;
  requireRole(role, ["ADMIN", "MANAGER"]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Manager Area</h1>
      <p className="mt-2">ADMIN and MANAGER can see this.</p>
    </main>
  );
}
