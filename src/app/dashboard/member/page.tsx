import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

export default async function MemberPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    throw new Error("UNAUTHORIZED");
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Member Area</h1>
      <p className="mt-2">All authenticated users can see this.</p>
      <p className="mt-2 text-sm text-gray-600">User: {session.user.email}</p>
    </main>
  );
}
