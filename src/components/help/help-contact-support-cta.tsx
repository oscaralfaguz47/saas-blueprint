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
    <div className="mt-10 rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-4 py-4 sm:px-5">
      <p className="text-sm text-(--text-secondary)">
        Have a question not answered here?{" "}
        <Link
          href={`/auth/sign-in?callbackUrl=${callback}`}
          className="font-medium text-(--color-primary) hover:underline"
        >
          Sign in
        </Link>{" "}
        to contact support.
      </p>
    </div>
  );
}
