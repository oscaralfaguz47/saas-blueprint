import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";

export default async function PublicHomePage() {
  const session = await getServerSession(authOptions);

  // Logged-in users go to the product area
  if (session?.user) {
    redirect("/app/dashboard");
  }

  // Logged-out users see the public landing
  return (
    <main style={{ padding: 24 }}>
      <h1>Welcome</h1>
      <p>This is the public landing page.</p>

      <a href="/auth/sign-in">Sign in</a>
    </main>
  );
}
