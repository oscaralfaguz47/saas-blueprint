import Link from "next/link";

type Props = {
  searchParams?: {
    error?: string;
    callbackUrl?: string;
  };
};

function getErrorCopy(error?: string) {
  // IMPORTANT:
  // NextAuth sometimes does NOT send `error=Verification`
  // when a magic link is expired or already used.
  // In those cases, `error` is undefined.
  const normalizedError = error ?? "Verification";

  switch (normalizedError) {
    case "Verification":
      return {
        title: "This sign-in link is no longer valid",
        description:
          "Magic links can only be used once and may expire after a few minutes. Please request a new link and try again.",
      };

    case "OAuthAccountNotLinked":
      return {
        title: "This email is already registered",
        description:
          "This email was previously used with a different sign-in method. Please sign in using the same method you used before (Google or Magic link).",
      };

    case "AccessDenied":
      return {
        title: "Access denied",
        description:
          "You do not have permission to sign in. If you believe this is a mistake, please contact support.",
      };

    default:
      return {
        title: "Sign-in error",
        description:
          "Something went wrong while trying to sign you in. Please try again.",
      };
  }
}

export default function AuthErrorPage({ searchParams }: Props) {
  const error = searchParams?.error;
  const copy = getErrorCopy(error);

  return (
    <main className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white shadow-sm px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          {copy.title}
        </h1>

        <p className="mt-2 text-sm text-black/60">
          {copy.description}
        </p>

        <div className="mt-6">
          <Link
            href="/auth/sign-in"
            className="inline-flex w-full items-center justify-center rounded-xl border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
          >
            Back to sign in
          </Link>
        </div>

        <p className="mt-6 text-xs text-black/45">
          Error code:{" "}
          <span className="font-mono">
            {error ?? "Verification"}
          </span>
        </p>
      </div>
    </main>
  );
}
