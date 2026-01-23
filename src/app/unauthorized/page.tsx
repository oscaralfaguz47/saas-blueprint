import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-neutral-50 px-6">
      <div className="w-full max-w-md rounded-2xl border border-neutral-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
          <span className="text-lg font-semibold text-red-600">403</span>
        </div>

        <h1 className="mb-2 text-xl font-semibold text-neutral-900">
          Access denied
        </h1>

        <p className="mb-6 text-sm leading-relaxed text-neutral-600">
          You don’t have permission to access this page.
          <br />
          If you believe this is a mistake, please contact an administrator.
        </p>

        <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/app/dashboard"
            className="inline-flex items-center justify-center rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-800"
          >
            Go back to dashboard
          </Link>
        </div>
      </div>
    </main>
  );
}
