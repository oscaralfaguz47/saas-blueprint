import Link from "next/link";

export default function VerifyPage() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <h1 className="text-2xl font-semibold">Check your email</h1>
        <p className="mt-2 text-gray-600">
          We sent you a sign-in link. Open your inbox and click the link to finish signing in.
        </p>

        <div className="mt-6 flex gap-3">
          <Link
            href="/auth/sign-in"
            className="inline-flex items-center justify-center rounded-md border px-4 py-2 text-sm font-medium"
          >
            Back to sign in
          </Link>

          <Link
            href="/"
            className="inline-flex items-center justify-center rounded-md px-4 py-2 text-sm font-medium underline"
          >
            Go to home
          </Link>
        </div>

        <p className="mt-6 text-xs text-gray-500">
          If you don’t see it, check your spam folder.
        </p>
      </div>
    </main>
  );
}
