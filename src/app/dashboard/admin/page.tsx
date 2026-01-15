import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireRole } from "@/server/security/authorization";

export default async function AdminPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  requireRole(session.user.role, ["ADMIN"]);

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Admin Area</h1>
      <p className="mt-2">Only ADMIN can see this.</p>
    </main>
  );
}
