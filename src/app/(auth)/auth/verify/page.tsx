import Link from "next/link";

import AuthCard from "@/components/auth/auth-card";

export default function VerifyPage() {
  return (
    <AuthCard
      title="Check your email"
      subtitle="We sent you a sign-in link. Open your inbox and click the link to finish signing in."
    >
      <div className="space-y-4">
        <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 shrink-0">
              <svg
                className="h-4 w-4 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75"
                />
              </svg>
            </div>
            <div>
              <p className="text-sm font-semibold text-(--text-primary)">Email sent</p>
              <p className="mt-0.5 text-xs text-(--text-secondary)">
                Check your inbox and spam folder if you don&apos;t see it.
              </p>
            </div>
          </div>
        </div>

        <Link
          href="/auth/sign-in"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) px-4 text-sm font-semibold text-(--text-primary) transition-all hover:border-(--border-strong) hover:bg-(--bg-surface-hover)"
        >
          ← Back to sign in
        </Link>

        <p className="text-center text-xs text-(--text-muted)">
          Wrong email?{" "}
          <Link
            href="/auth/sign-in"
            className="text-emerald-400 transition-colors hover:text-emerald-300"
          >
            Try a different address
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}
