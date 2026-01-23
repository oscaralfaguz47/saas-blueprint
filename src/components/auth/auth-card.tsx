import Link from "next/link";

type MessageTone = "error" | "info" | "success" | "warning";

type Message = {
  tone: MessageTone;
  title: string;
  description?: string;
  code?: string;
};

type AuthCardProps = {
  title: string;
  subtitle?: string;
  badgeText?: string;
  message?: Message;
  children: React.ReactNode;
};

function toneStyles(tone: MessageTone) {
  switch (tone) {
    case "error":
      return "border-(--color-danger) bg-(--bg-surface) text-(--text-primary)";
    case "success":
      return "border-(--color-success) bg-(--bg-surface) text-(--text-primary)";
    case "warning":
      return "border-(--color-warning) bg-(--bg-surface) text-(--text-primary)";
    default:
      return "border-(--border-subtle) bg-(--bg-surface) text-(--text-primary)";
  }
}

export default function AuthCard({
  title,
  subtitle,
  badgeText = "Secure",
  message,
  children,
}: AuthCardProps) {
  return (
    <main className="min-h-screen bg-(--bg-main)">
      <div className="flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          {/* Top brand row */}
          <div className="mb-6 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <div className="grid h-9 w-9 place-items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface)">
                <span className="text-xs font-semibold text-(--text-primary)">
                  ATL
                </span>
              </div>
              <span className="text-sm font-medium text-(--text-primary)">
                ATL
              </span>
            </Link>

            <span className="rounded-md border border-(--border-subtle) bg-(--bg-surface) px-2 py-1 text-xs font-medium text-(--text-secondary)">
              {badgeText}
            </span>
          </div>

          {/* Card */}
          <div className="rounded-xl border border-(--border-subtle) bg-(--bg-surface) p-6">
            <div className="text-center">
              <h1 className="text-xl font-semibold text-(--text-primary)">
                {title}
              </h1>
              {subtitle ? (
                <p className="mt-2 text-sm leading-relaxed text-(--text-secondary)">
                  {subtitle}
                </p>
              ) : null}
            </div>

            {message ? (
              <div
                className={[
                  "mt-6 rounded-xl border p-4",
                  toneStyles(message.tone),
                ].join(" ")}
              >
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-sm font-semibold text-(--text-primary)">
                      {message.title}
                    </p>
                    {message.description ? (
                      <p className="mt-1 text-sm text-(--text-secondary)">
                        {message.description}
                      </p>
                    ) : null}
                  </div>

                  {message.code ? (
                    <span className="rounded-md bg-(--bg-surface-elev) px-2 py-1 text-xs font-medium text-(--text-secondary)">
                      {message.code}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-6">{children}</div>

            <p className="mt-6 text-center text-xs text-(--text-muted)">
              By continuing, you agree to our{" "}
              <Link
                href="/terms"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Terms
              </Link>{" "}
              and{" "}
              <Link
                href="/privacy"
                className="text-(--text-secondary) hover:text-(--text-primary)"
              >
                Privacy Policy
              </Link>
              .
            </p>
          </div>
        </div>
      </div>
    </main>
  );
}
