import Link from "next/link";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/auth-options";

export default async function DashboardPage() {
  const session = await getServerSession(authOptions);

  if (!session?.user) {
    return (
      <main className="p-6">
        <p>You are not signed in.</p>
        <Link className="underline" href="/signin">
          Sign in
        </Link>
      </main>
    );
  }

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Dashboard</h1>

      <p className="mt-2 text-sm text-gray-600">
        Signed in as: {session.user.email}
      </p>
      <p className="mt-1 text-sm text-gray-600">
        Role: {session.user.role}
      </p>

      <div className="mt-6 flex gap-3">
        <Link className="underline" href="/dashboard/admin">Admin</Link>
        <Link className="underline" href="/dashboard/manager">Manager</Link>
        <Link className="underline" href="/dashboard/member">Member</Link>
        <Link className="underline" href="/api/auth/signout">Sign out</Link>
      </div>
    </main>
  );
}
