import Link from "next/link";
import React from "react";

type Props = {
  title: string;
  subtitle?: string;
  badgeText?: string;
  children: React.ReactNode;

  // Optional: message box
  message?: {
    tone: "error" | "info";
    title: string;
    description: string;
    code?: string;
  };

  // Optional: footer links
  footer?: {
    termsHref?: string;
    privacyHref?: string;
  };
};

export default function AuthCard({
  title,
  subtitle,
  badgeText = "Secure",
  children,
  message,
  footer = { termsHref: "/terms", privacyHref: "/privacy" },
}: Props) {
  const isError = message?.tone === "error";

  return (
    <main className="min-h-[calc(100vh-1px)] flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-black/10 bg-white shadow-sm">
          <div className="px-6 pt-6 pb-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
                {subtitle ? (
                  <p className="mt-1 text-sm text-black/60">{subtitle}</p>
                ) : null}
              </div>

              {badgeText ? (
                <div className="text-xs rounded-full border border-black/10 px-3 py-1 text-black/60">
                  {badgeText}
                </div>
              ) : null}
            </div>

            {message ? (
              <div
                className={[
                  "mt-4 rounded-xl px-4 py-3 border",
                  isError
                    ? "border-red-200 bg-red-50"
                    : "border-black/10 bg-black/[0.02]",
                ].join(" ")}
              >
                <p
                  className={[
                    "text-sm font-medium",
                    isError ? "text-red-900" : "text-black",
                  ].join(" ")}
                >
                  {message.title}
                </p>

                <p
                  className={[
                    "mt-1 text-sm",
                    isError ? "text-red-800" : "text-black/70",
                  ].join(" ")}
                >
                  {message.description}
                </p>

                {message.code ? (
                  <p className={["mt-2 text-xs", isError ? "text-red-900/60" : "text-black/50"].join(" ")}>
                    Error code: <span className="font-mono">{message.code}</span>
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>

          <div className="px-6 pb-6">
            <div className="rounded-xl border border-black/10 bg-black/[0.02] p-4">
              {children}
            </div>

            <div className="mt-6 border-t border-black/10 pt-4 text-xs text-black/45">
              By continuing, you agree to our{" "}
              <Link href={footer.termsHref ?? "/terms"} className="underline underline-offset-2">
                Terms
              </Link>{" "}
              and acknowledge our{" "}
              <Link href={footer.privacyHref ?? "/privacy"} className="underline underline-offset-2">
                Privacy Policy
              </Link>
              .
            </div>
          </div>
        </div>

        <p className="mt-6 text-center text-xs text-black/40">
          © {new Date().getFullYear()} Your Company. All rights reserved.
        </p>
      </div>
    </main>
  );
}
