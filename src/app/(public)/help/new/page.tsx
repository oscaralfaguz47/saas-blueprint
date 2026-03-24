"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";

import { CardContent, CardRoot } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";

export default function PublicHelpNewPage() {
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

  if (doneEmail) {
    return (
      <div className="mx-auto max-w-lg py-6">
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
    );
  }

  return (
    <div className="mx-auto max-w-lg py-6">
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
  );
}
