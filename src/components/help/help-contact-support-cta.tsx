import Link from "next/link";

type Props = {
  /** URL to return to after sign-in (path + query). */
  signInCallbackUrl: string;
};

/**
 * Shown on public KB search/article pages when the user is not signed in.
 */
export function HelpContactSupportCta({ signInCallbackUrl }: Props) {
  const callback = encodeURIComponent(signInCallbackUrl);
  return (
    <div className="mt-10 rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-6">
      <div className="flex items-start gap-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-emerald-500/20 bg-emerald-500/10">
          <svg
            className="h-5 w-5 text-emerald-400"
            fill="none"
            viewBox="0 0 24 24"
            strokeWidth={1.5}
            stroke="currentColor"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"
            />
          </svg>
        </div>

        <div className="min-w-0 flex-1">
          <p className="mb-1 text-sm font-semibold text-(--text-primary)">Still have questions?</p>
          <p className="text-sm text-(--text-secondary)">
            Have a question not answered here?{" "}
            <Link
              href={`/auth/sign-in?callbackUrl=${callback}`}
              className="font-medium text-emerald-400 transition-colors hover:text-emerald-300"
            >
              Sign in to contact support →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
