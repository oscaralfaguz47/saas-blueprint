import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/server/auth-options";
import SignInForm from "./signin-form";

type Props = {
  searchParams?: {
    callbackUrl?: string;
    error?: string;
  };
};

function getErrorMessage(error?: string) {
  if (!error) return null;

  switch (error) {
    case "OAuthAccountNotLinked":
      return {
        title: "This email is already registered",
        description:
          "You previously signed in using a different method. Please sign in with the same method you used before (Magic link), or connect Google after you sign in.",
      };

    case "AccessDenied":
      return {
        title: "Access denied",
        description:
          "You do not have permission to sign in. If you believe this is a mistake, contact support.",
      };

    case "Verification":
      return {
        title: "Magic link expired or already used",
        description:
          "Please request a new magic link and try again.",
      };

    default:
      return {
        title: "Sign-in error",
        description:
          "Something went wrong while trying to sign you in. Please try again.",
      };
  }
}

export default async function SignInPage({ searchParams }: Props) {
  const session = await getServerSession(authOptions);
  if (session?.user) redirect("/app");

  const errorInfo = getErrorMessage(searchParams?.error);

  return (
    <main className="min-h-[calc(100vh-1px)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
                <p className="mt-1 text-sm text-black/60">
                  No password required. Use Google or get a magic link.
                </p>
              </div>

              <div className="text-xs rounded-full border border-black/10 px-3 py-1 text-black/60">
                Secure
              </div>
            </div>

            {errorInfo && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3">
                <p className="text-sm font-medium text-red-900">
                  {errorInfo.title}
                </p>
                <p className="mt-1 text-sm text-red-800">
                  {errorInfo.description}
                </p>
              </div>
            )}
          </div>

          <div className="px-6 pb-6">
            <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
              <SignInForm />
            </div>

            <div className="mt-4 flex items-start gap-2 text-xs text-black/55">
              <span className="mt-[2px] inline-block h-4 w-4 rounded-full border border-black/15 bg-white" />
              <p>
                Tip: If you previously used Magic Link, keep using Magic Link for the same email,
                unless your account is linked to Google.
              </p>
            </div>

            <div className="mt-6 border-t border-black/10 pt-4 text-xs text-black/45">
              By signing in, you agree to our Terms and acknowledge our Privacy Policy.
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-black/40">
          © {new Date().getFullYear()} Your Company. All rights reserved.
        </p>
      </div>
    </main>
  );
}
