import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";
import { requireRole } from "@/server/security/authorization";
import { redirect } from "next/navigation";

export default async function ManagerPage() {
  const session = await getServerSession(authOptions);

 // Not authenticated
  if (!session?.user) redirect("/signin");

  // Not authorized
  const role = session.user.role;
  if (role !== "ADMIN" && role !== "MANAGER") redirect("/unauthorized");

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Manager Area</h1>
      <p className="mt-2">ADMIN and MANAGER can see this.</p>
    </main>
  );
}
