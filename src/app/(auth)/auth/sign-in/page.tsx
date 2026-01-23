import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import SignInForm from "./signin-form";
import { getAuthErrorCopy } from "@/lib/auth-errors";
import AuthCard from "@/components/auth/auth-card";

type Props = {
  searchParams?: {
    callbackUrl?: string;
    error?: string;
  };
};

export default async function SignInPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/app");

  const error = searchParams?.error;
  const errorCopy = error ? getAuthErrorCopy(error) : null;

  return (
    <AuthCard
      title="Sign in"
      subtitle="No password required. Use Google or get a magic link."
      message={
        errorCopy
          ? {
              tone: "error",
              title: errorCopy.title,
              description: errorCopy.description,
              code: errorCopy.code,
            }
          : undefined
      }
    >
      <SignInForm />
    </AuthCard>
  );
}
