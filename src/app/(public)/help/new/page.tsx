"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useState, type FormEvent } from "react";

import { CardContent, CardRoot } from "@/components/ui/card";
import { Container } from "@/components/ui/container";
import { Spinner } from "@/components/ui/spinner";

export default function PublicHelpNewPage() {
  const { data: session } = useSession();
  const isLoggedIn = !!session?.user;

  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doneEmail, setDoneEmail] = useState<string | null>(null);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/help/new", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), subject: subject.trim(), message: message.trim() }),
      });
      if (!res.ok) {
        const j = (await res.json()) as { error?: { message?: string } };
        setError(j.error?.message ?? "Something went wrong. Please try again.");
        return;
      }
      setDoneEmail(email.trim());
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <main
      className="min-h-screen bg-(--marketing-legal-bg)"
      style={{ backgroundColor: "var(--marketing-legal-bg, #0f1117)" }}
    >
      <header
        className="border-b border-(--border-subtle) bg-(--bg-main)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
        <Container>
          <div className="flex h-16 items-center justify-between">
            <div className="flex items-center gap-3">
              <Link
                href="/"
                className="grid h-9 w-9 place-items-center rounded-lg border border-(--border-subtle) bg-(--bg-surface)"
                style={{ backgroundColor: "var(--bg-surface, #1a1f2e)" }}
              >
                <span className="text-xs font-semibold text-(--text-primary)">ATL</span>
              </Link>
              <Link href="/" className="text-sm font-medium text-(--text-primary)">
                ATL
              </Link>
            </div>
            <nav className="flex items-center gap-3">
              <Link
                href="/"
                className="text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Home
              </Link>
              <Link
                href="/pricing"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Pricing
              </Link>
              <Link
                href="/privacy"
                className="hidden text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary) md:inline"
              >
                Privacy
              </Link>
              <Link
                href={isLoggedIn ? "/app/requests" : "/auth/sign-in"}
                className="inline-flex h-9 items-center justify-center rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 text-sm font-medium text-(--text-secondary) transition-colors hover:text-(--text-primary)"
                style={{ backgroundColor: "var(--bg-surface, #1a1f2e)" }}
              >
                {isLoggedIn ? "Go to app" : "Sign in"}
              </Link>
            </nav>
          </div>
        </Container>
      </header>

      <section className="flex-1 py-16 md:py-24">
        <Container>
          {doneEmail ? (
            <div className="mx-auto max-w-lg">
              <CardRoot>
                <CardContent className="p-6 text-center">
                  <p className="text-sm font-medium text-(--text-primary)">
                    Thanks! We&apos;ll be in touch at {doneEmail} shortly.
                  </p>
                  <Link
                    href="/help"
                    className="mt-4 inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
                  >
                    Back to Help
                  </Link>
                </CardContent>
              </CardRoot>
            </div>
          ) : (
            <div className="mx-auto max-w-lg">
              <h1 className="text-2xl font-semibold text-(--text-primary)">Get in touch</h1>
              <p className="mt-2 text-sm text-(--text-muted)">
                Interested in Relitrue? Our team will get back to you within one business day.
              </p>

              <CardRoot className="mt-8">
                <CardContent className="p-6">
                  <form onSubmit={onSubmit} className="space-y-4">
                    <div>
                      <label htmlFor="sales-email" className="text-sm font-medium text-(--text-primary)">
                        Email
                      </label>
                      <input
                        id="sales-email"
                        type="email"
                        required
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="mt-1 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="sales-subject" className="text-sm font-medium text-(--text-primary)">
                        Subject
                      </label>
                      <input
                        id="sales-subject"
                        type="text"
                        required
                        maxLength={255}
                        value={subject}
                        onChange={(e) => setSubject(e.target.value)}
                        placeholder="What would you like to know about Relitrue?"
                        className="mt-1 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm"
                      />
                    </div>
                    <div>
                      <label htmlFor="sales-message" className="text-sm font-medium text-(--text-primary)">
                        Message
                      </label>
                      <textarea
                        id="sales-message"
                        required
                        maxLength={4000}
                        rows={6}
                        value={message}
                        onChange={(e) => setMessage(e.target.value)}
                        placeholder="Tell us about your use case or question..."
                        className="mt-1 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm"
                      />
                    </div>
                    {error ? <p className="text-sm text-(--color-danger)">{error}</p> : null}
                    <button
                      type="submit"
                      disabled={submitting}
                      className="inline-flex h-10 w-full items-center justify-center rounded-lg bg-(--color-primary) text-sm font-semibold text-white hover:bg-(--color-primary-hover) disabled:opacity-50"
                    >
                      {submitting ? <Spinner size="sm" /> : "Send message"}
                    </button>
                  </form>
                </CardContent>
              </CardRoot>
            </div>
          )}
        </Container>
      </section>

      <footer
        className="border-t border-(--border-subtle) bg-(--bg-main)"
        style={{ backgroundColor: "var(--bg-main, #0f1117)" }}
      >
        <Container>
          <div className="flex flex-col gap-4 py-10 md:flex-row md:items-center md:justify-between">
            <div className="text-sm text-(--text-muted)">
              © {new Date().getFullYear()} ATL. All rights reserved.
            </div>
            <div className="flex items-center gap-6 text-sm">
              <Link
                href="/privacy"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Privacy
              </Link>
              <Link
                href="/pricing"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Pricing
              </Link>
              <Link
                href="/auth/sign-in"
                className="text-(--text-secondary) transition-colors hover:text-(--text-primary)"
              >
                Sign in
              </Link>
            </div>
          </div>
        </Container>
      </footer>
    </main>
  );
}
