export default function VerifyRequestPage() {
  return (
    <main className="min-h-[calc(100vh-1px)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-black/10 bg-white shadow-sm px-6 py-6">
        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>
        <p className="mt-2 text-sm text-black/60">
          We sent you a magic link. Open it to finish signing in.
        </p>

        <div className="mt-6">
          <a
            href="/auth/sign-in"
            className="inline-flex items-center justify-center rounded-xl border border-black/10 px-4 py-2 text-sm font-medium hover:bg-black/[0.03]"
          >
            Back
          </a>
        </div>

        <p className="mt-6 text-xs text-black/45">
          If you don’t see it, check Spam/Junk. The link can only be used once.
        </p>
      </div>
    </main>
  );
}
