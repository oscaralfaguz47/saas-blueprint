import Link from "next/link";
import { SignOutLink } from "./sign-out-link";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="flex min-h-screen items-center justify-center px-6">
        <div className="w-full max-w-md rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-8 text-center">
          <div className="mx-auto mb-6 flex h-12 w-12 items-center justify-center rounded-full bg-(--bg-surface-elev)">
            <span className="text-sm font-semibold text-(--text-primary)">
              403
            </span>
          </div>

          <h1 className="mb-2 text-xl font-semibold text-(--text-primary)">
            Access denied
          </h1>

          <p className="mb-6 text-sm leading-relaxed text-(--text-secondary)">
            You don’t have permission to access this page.
            <br />
            If you believe this is a mistake, please contact an administrator.
          </p>

          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/app"
              className="inline-flex h-11 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white transition-colors hover:bg-(--color-primary-hover)"
            >
              Go back to app
            </Link>

            <SignOutLink />
          </div>
        </div>
      </div>
    </main>
  );
}
