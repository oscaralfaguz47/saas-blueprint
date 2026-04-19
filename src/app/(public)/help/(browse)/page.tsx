"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { CardContent, CardRoot } from "@/components/ui/card";

export default function PublicHelpHomePage() {
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
        body: JSON.stringify({
          email: email.trim(),
          subject: subject.trim(),
          message: message.trim(),
        }),
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

  if (doneEmail) {
    return (
      <div className="mx-auto max-w-lg py-6">
        <CardRoot>
          <CardContent className="p-8 text-center">
            <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-full border border-emerald-500/20 bg-emerald-500/10">
              <svg
                className="h-7 w-7 text-emerald-400"
                fill="none"
                viewBox="0 0 24 24"
                strokeWidth={2}
                stroke="currentColor"
                aria-hidden
              >
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
              </svg>
            </div>

            <p className="text-xl font-bold text-(--text-primary)">Message sent!</p>
            <p className="mt-2 text-sm text-(--text-secondary)">
              We received your message and will respond within one business day.
            </p>

            <button
              type="button"
              onClick={() => {
                setDoneEmail(null);
                setEmail("");
                setSubject("");
                setMessage("");
                setError(null);
              }}
              className="mt-6 inline-flex items-center justify-center rounded-md bg-emerald-500 px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-emerald-600"
            >
              Back to Help Center
            </button>
          </CardContent>
        </CardRoot>
      </div>
    );
  }

  const fieldClass =
    "mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm text-(--text-primary) placeholder:text-(--text-muted) transition-all focus:border-emerald-500/50 focus:outline-none focus:ring-2 focus:ring-emerald-500/30";

  return (
    <div className="mx-auto max-w-lg py-6">
      <p className="mb-3 text-xs font-semibold uppercase tracking-widest text-emerald-400">Support</p>
      <h1 className="text-3xl font-bold text-(--text-primary)">Get in touch</h1>
      <p className="mt-3 text-base text-(--text-secondary)">
        Our team will get back to you within one business day.
      </p>
      <CardRoot className="mt-8">
        <CardContent className="p-8">
          <form onSubmit={onSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="help-email"
                className="mb-1.5 block text-sm font-medium text-(--text-primary)"
              >
                Email
              </label>
              <input
                id="help-email"
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className={fieldClass}
              />
            </div>
            <div>
              <label
                htmlFor="help-subject"
                className="mb-1.5 block text-sm font-medium text-(--text-primary)"
              >
                Subject
              </label>
              <input
                id="help-subject"
                type="text"
                required
                maxLength={255}
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="What would you like to know about Relitrue?"
                className={fieldClass}
              />
            </div>
            <div>
              <label
                htmlFor="help-message"
                className="mb-1.5 block text-sm font-medium text-(--text-primary)"
              >
                Message
              </label>
              <textarea
                id="help-message"
                required
                maxLength={4000}
                rows={6}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Tell us about your use case or question..."
                className={`${fieldClass} resize-none`}
              />
              <p
                className={`mt-1 text-right text-xs ${
                  message.length >= 3900
                    ? "text-(--color-danger)"
                    : message.length > 3500
                      ? "text-warning"
                      : "text-(--text-muted)"
                }`}
              >
                {message.length} / 4000
              </p>
            </div>
            {error ? (
              <p className="text-sm text-(--color-danger)">{error}</p>
            ) : null}
            <button
              type="submit"
              disabled={submitting}
              className="mt-2 inline-flex h-11 w-full items-center justify-center rounded-md bg-emerald-500 text-sm font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {submitting ? "Sending message..." : "Send message"}
            </button>
            <p className="mt-3 text-center text-xs text-(--text-muted)">
              By submitting you agree to our{" "}
              <Link
                href="/privacy"
                className="text-emerald-400 transition-colors hover:text-emerald-300"
              >
                Privacy Policy
              </Link>
            </p>
          </form>
        </CardContent>
      </CardRoot>
    </div>
  );
}
