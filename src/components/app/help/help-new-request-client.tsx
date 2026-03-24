"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

import { CardContent, CardHeader, CardRoot } from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { useToast } from "@/components/ui/toast";
import { useApiFetch } from "@/hooks/use-api-fetch";

type Category = { id: string; name: string };

const PRIORITIES = [
  {
    value: "LOW" as const,
    label: "Low",
    description: "General questions; no urgency.",
  },
  {
    value: "MEDIUM" as const,
    label: "Medium",
    description: "Affects work but you can continue.",
  },
  {
    value: "HIGH" as const,
    label: "High",
    description: "Blocking or time-sensitive.",
  },
];

export function HelpNewRequestClient() {
  const apiFetch = useApiFetch();
  const toast = useToast();
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesLoading, setCategoriesLoading] = useState(true);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"LOW" | "MEDIUM" | "HIGH">("MEDIUM");
  const [topicId, setTopicId] = useState<string>("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [successTicketId, setSuccessTicketId] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setCategoriesLoading(true);
      try {
        const res = await apiFetch("/api/app/help/categories");
        if (res.ok) {
          const json = (await res.json()) as { data: { categories: Category[] } };
          setCategories(json.data?.categories ?? []);
        }
      } finally {
        setCategoriesLoading(false);
      }
    })();
  }, [apiFetch]);

  const onSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      setFieldError(null);
      if (!subject.trim() || !message.trim()) {
        setFieldError("Subject and message are required.");
        return;
      }
      setSubmitting(true);
      try {
        const res = await apiFetch("/api/app/help/tickets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            subject: subject.trim(),
            message: message.trim(),
            priority,
            topicCategoryId: topicId || null,
          }),
        });
        if (!res.ok) {
          toast.addToast("error", "Could not create ticket");
          return;
        }
        const json = (await res.json()) as { data: { ticketId: string } };
        setSuccessTicketId(json.data.ticketId);
        toast.addToast("success", "Request submitted");
      } finally {
        setSubmitting(false);
      }
    },
    [apiFetch, message, priority, subject, toast, topicId]
  );

  if (successTicketId) {
    return (
      <CardRoot>
        <CardHeader>
          <h2 className="text-lg font-semibold text-(--text-primary)">Request submitted</h2>
          <p className="mt-1 text-sm text-(--text-muted)">
            Our team typically responds within one business day. You can follow the conversation in your inbox.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-(--text-secondary)">
            Ticket ID: <span className="font-mono text-(--text-primary)">{successTicketId}</span>
          </p>
          <div className="flex flex-wrap gap-3">
            <Link
              href={`/app/help/tickets/${successTicketId}`}
              className="inline-flex h-10 items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white hover:bg-(--color-primary-hover)"
            >
              View ticket
            </Link>
            <Link
              href="/app/help/inbox"
              className="inline-flex h-10 items-center justify-center rounded-lg border border-(--border-strong) bg-(--bg-surface) px-4 text-sm font-medium text-(--text-primary) hover:bg-(--bg-surface-hover)"
            >
              Go to inbox
            </Link>
          </div>
        </CardContent>
      </CardRoot>
    );
  }

  return (
    <CardRoot>
      <CardHeader>
        <h2 className="text-lg font-semibold text-(--text-primary)">Contact Support</h2>
        <p className="mt-1 text-sm text-(--text-muted)">Our team typically responds within one business day.</p>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="space-y-6">
          {fieldError ? <p className="text-sm text-(--color-danger)">{fieldError}</p> : null}

          <label className="block">
            <span className="text-sm font-medium text-(--text-primary)">Subject</span>
            <input
              required
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              maxLength={255}
              className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm shadow-sm focus:border-(--color-primary-soft) focus:outline-none focus:ring-2 focus:ring-(--color-primary-soft)/25"
              placeholder="Brief summary of your question"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-(--text-primary)">Topic</span>
            <span className="ml-1 text-xs font-normal text-(--text-muted)">(optional)</span>
            <select
              value={topicId}
              onChange={(e) => setTopicId(e.target.value)}
              disabled={categoriesLoading}
              className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm shadow-sm focus:border-(--color-primary-soft) focus:outline-none focus:ring-2 focus:ring-(--color-primary-soft)/25 disabled:opacity-60"
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </label>

          <fieldset>
            <legend className="text-sm font-medium text-(--text-primary)">Priority</legend>
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {PRIORITIES.map((p) => (
                <button
                  key={p.value}
                  type="button"
                  onClick={() => setPriority(p.value)}
                  className={`rounded-lg border px-3 py-3 text-left text-sm transition ${
                    priority === p.value
                      ? "border-(--color-primary) bg-(--nav-active) shadow-sm ring-1 ring-(--color-primary-soft)/40"
                      : "border-(--border-subtle) bg-(--bg-surface-elev) hover:bg-(--nav-hover)"
                  }`}
                >
                  <div className="font-semibold text-(--text-primary)">{p.label}</div>
                  <div className="mt-1 text-xs text-(--text-muted)">{p.description}</div>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="block">
            <span className="text-sm font-medium text-(--text-primary)">Message</span>
            <textarea
              required
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={4000}
              rows={8}
              className="mt-1.5 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2.5 text-sm shadow-sm focus:border-(--color-primary-soft) focus:outline-none focus:ring-2 focus:ring-(--color-primary-soft)/25"
              placeholder="Describe the issue, steps to reproduce, and what you expected."
            />
            <div className="mt-1 text-right text-xs text-(--text-muted)">{message.length} / 4000</div>
          </label>

          <button
            type="submit"
            disabled={submitting}
            className="inline-flex h-11 min-w-[10rem] items-center justify-center gap-2 rounded-lg bg-(--color-primary) px-5 text-sm font-semibold text-white shadow-sm hover:bg-(--color-primary-hover) disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? <Spinner size="sm" /> : null}
            Send request
          </button>
        </form>
      </CardContent>
    </CardRoot>
  );
}
