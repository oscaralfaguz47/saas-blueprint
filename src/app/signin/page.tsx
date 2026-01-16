import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import SignInButton from "./signin-button";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);

  if (session?.user) {
    redirect("/dashboard");
  }

  return (
    <main style={{ padding: 24 }}>
      <h1>Sign in</h1>
      <SignInButton />
    </main>
  );
}
