import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import SignInForm from "./signin-form";

export default async function SignInPage() {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/app");

  return (
    <main className="p-6">
      <h1 className="text-xl font-semibold">Sign in</h1>
      <p className="mt-2 opacity-70">No password required.</p>

      <div className="mt-6">
        <SignInForm />
      </div>
    </main>
  );
}
