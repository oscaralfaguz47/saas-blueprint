import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireRole } from "@/server/security/authorization";

export default async function ManagerPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  requireRole(session.user.role, ["ADMIN", "MANAGER"]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Manager Area</h1>
      <p className="mt-2">ADMIN and MANAGER can see this.</p>
    </main>
  );
}
