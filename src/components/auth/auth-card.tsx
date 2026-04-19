import Image from "next/image";
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
  subtitle?: React.ReactNode;
  badgeText?: string;
  message?: Message;
  children: React.ReactNode;
};

function toneStyles(tone: MessageTone) {
  switch (tone) {
    case "error":
      return "border-(--color-danger)/40 bg-(--color-danger)/5 text-(--text-primary)";
    case "success":
      return "border-emerald-500/30 bg-emerald-500/5 text-(--text-primary)";
    case "warning":
      return "border-(--color-warning)/40 bg-(--color-warning)/5 text-(--text-primary)";
    default:
      return "border-(--border-subtle) bg-(--bg-surface-elev) text-(--text-primary)";
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
      <div className="flex min-h-screen flex-col items-center justify-center px-6 py-12">
        <div className="w-full max-w-md">
          <div className="mb-8 flex items-center justify-between">
            <Link href="/" className="flex items-center gap-3">
              <Image
                src="/relitrue-logo.svg"
                alt="Relitrue"
                width={110}
                height={24}
                className="h-6 w-auto object-contain object-left"
                priority
              />
            </Link>

            <span className="inline-flex items-center gap-1.5 rounded-md border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-400">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {badgeText}
            </span>
          </div>

          <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) p-8 shadow-2xl">
            <div className="text-center">
              <h1 className="text-2xl font-bold tracking-tight text-(--text-primary)">{title}</h1>
              {subtitle != null ? (
                <div className="mt-2.5 text-sm leading-relaxed text-(--text-secondary)">{subtitle}</div>
              ) : null}
            </div>

            {message ? (
              <div className={["mt-6 rounded-xl border p-4", toneStyles(message.tone)].join(" ")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-(--text-primary)">{message.title}</p>
                    {message.description ? (
                      <p className="mt-1 text-sm text-(--text-secondary)">{message.description}</p>
                    ) : null}
                  </div>
                  {message.code ? (
                    <span className="shrink-0 rounded-md bg-(--bg-surface-elev) px-2 py-1 font-mono text-xs font-medium text-(--text-muted)">
                      {message.code}
                    </span>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="mt-7">{children}</div>

            <p className="mt-8 text-center text-xs text-(--text-muted)">
              By continuing, you agree to our{" "}
              <Link href="/terms" className="text-emerald-400 transition-colors hover:text-emerald-300">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/privacy" className="text-emerald-400 transition-colors hover:text-emerald-300">
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
