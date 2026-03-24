"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";

import { IconChatBubble, IconX } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

type SourceArticle = { id: string; title: string; slug: string };

type ChatLine = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceArticle[];
  createdAt: number;
};

function formatRelativeTime(ts: number): string {
  const s = Math.floor((Date.now() - ts) / 1000);
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} hr ago`;
  return `${Math.floor(s / 86400)} days ago`;
}

function TypingDots() {
  return (
    <div className="inline-flex items-center gap-1" aria-hidden>
      <span className="h-2 w-2 animate-pulse rounded-full bg-(--text-muted)" />
      <span
        className="h-2 w-2 animate-pulse rounded-full bg-(--text-muted)"
        style={{ animationDelay: "0.15s" }}
      />
      <span
        className="h-2 w-2 animate-pulse rounded-full bg-(--text-muted)"
        style={{ animationDelay: "0.3s" }}
      />
    </div>
  );
}

const EMPTY_KB =
  "I don't have enough information in our Knowledge Base to answer that. I recommend creating a support request so our team can help.";

export type ChatWidgetProps = {
  forcedSurface: "app" | "public";
};

export function ChatWidget({ forcedSurface }: ChatWidgetProps) {
  const { data: session, status } = useSession();
  /** Bubble always renders after `mounted`; this only gates API surfaces (never `status === "loading"`). */
  const useAppFlow =
    forcedSurface === "app" || (forcedSurface === "public" && !!session?.user?.id);

  const [open, setOpen] = useState(false);
  const [pulse, setPulse] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [visitorEmail, setVisitorEmail] = useState("");
  const [emailGateDone, setEmailGateDone] = useState(false);
  const [lines, setLines] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [creatingSession, setCreatingSession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [titles, setTitles] = useState<string[]>([]);
  const [hasUnread, setHasUnread] = useState(false);
  const [mounted, setMounted] = useState(false);

  const threadRef = useRef<HTMLDivElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const openRef = useRef(false);

  const articleBase = useAppFlow ? "/app/help/article" : "/help/article";
  const contactHref = useAppFlow ? "/app/help/new" : "/help/new";

  useEffect(() => {
    const url = useAppFlow ? "/api/app/help/chat/suggestions" : "/api/help/chat/suggestions";
    void fetch(url, { credentials: useAppFlow ? "include" : "same-origin" })
      .then((r) => r.json())
      .then((j: { data?: { titles?: string[] } }) => {
        setTitles(Array.isArray(j.data?.titles) ? j.data!.titles! : []);
      })
      .catch(() => setTitles([]));
  }, [useAppFlow]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [lines, loading, open]);

  useEffect(() => {
    openRef.current = open;
    if (open) {
      setPulse(false);
      setHasUnread(false);
    }
  }, [open]);

  useLayoutEffect(() => {
    setMounted(true);
  }, []);

  const ensureAppSession = useCallback(async () => {
    if (sessionId || !useAppFlow) return sessionId;
    setCreatingSession(true);
    setError(null);
    try {
      const res = await fetch("/api/app/help/chat/session", {
        method: "POST",
        credentials: "include",
      });
      if (!res.ok) {
        setError("Could not start chat. Try again.");
        return null;
      }
      const j = (await res.json()) as { data?: { sessionId?: string } };
      const id = j.data?.sessionId ?? null;
      setSessionId(id);
      return id;
    } catch {
      setError("Could not start chat. Try again.");
      return null;
    } finally {
      setCreatingSession(false);
    }
  }, [sessionId, useAppFlow]);

  const ensurePublicSession = useCallback(async () => {
    if (sessionId) return sessionId;
    const em = visitorEmail.trim();
    if (!em) {
      setError("Enter your email to continue.");
      return null;
    }
    setCreatingSession(true);
    setError(null);
    try {
      const res = await fetch("/api/help/chat/session", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorEmail: em }),
      });
      if (!res.ok) {
        setError("Could not start chat. Try again.");
        return null;
      }
      const j = (await res.json()) as { data?: { sessionId?: string } };
      const id = j.data?.sessionId ?? null;
      setSessionId(id);
      setEmailGateDone(true);
      return id;
    } catch {
      setError("Could not start chat. Try again.");
      return null;
    } finally {
      setCreatingSession(false);
    }
  }, [sessionId, visitorEmail]);

  const openPanel = useCallback(async () => {
    setOpen(true);
    if (useAppFlow) {
      await ensureAppSession();
    }
  }, [useAppFlow, ensureAppSession]);

  useEffect(() => {
    const handler = () => {
      void openPanel();
    };
    window.addEventListener("open-chat-widget", handler);
    return () => window.removeEventListener("open-chat-widget", handler);
  }, [openPanel]);

  const sendMessage = async (text: string) => {
    const query = text.trim();
    if (query.length < 2 || loading) return;

    let sid = sessionId;
    if (useAppFlow) {
      sid = (await ensureAppSession()) ?? null;
    } else {
      if (!emailGateDone) {
        setError("Start chat with your email first.");
        return;
      }
      sid = sessionId;
    }
    if (!sid) return;

    const userLine: ChatLine = {
      id: `u-${Date.now()}`,
      role: "user",
      content: query,
      sources: [],
      createdAt: Date.now(),
    };
    setLines((prev) => [...prev, userLine]);
    setDraft("");
    setLoading(true);
    setError(null);

    const url = useAppFlow
      ? `/api/app/help/chat/session/${sid}/message`
      : `/api/help/chat/session/${sid}/message`;

    const body: { query: string; visitorEmail?: string } = { query };
    if (!useAppFlow && visitorEmail.trim()) {
      body.visitorEmail = visitorEmail.trim();
    }

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: useAppFlow ? "include" : "same-origin",
        body: JSON.stringify(body),
      });

      if (res.status === 400) {
        const errBody = (await res.json()) as { error?: { code?: string } };
        if (errBody.error?.code === "VISITOR_EMAIL_REQUIRED") {
          setError("Email is required. Please enter it above and try again.");
          setLoading(false);
          return;
        }
      }

      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      const j = (await res.json()) as {
        data?: {
          aiAnswer?: string | null;
          citedArticles?: SourceArticle[];
        };
      };
      const ai =
        j.data?.aiAnswer?.trim() && j.data.aiAnswer.trim().length > 0
          ? j.data.aiAnswer.trim()
          : EMPTY_KB;
      const sources = Array.isArray(j.data?.citedArticles) ? j.data!.citedArticles! : [];

      setLines((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: ai,
          sources,
          createdAt: Date.now(),
        },
      ]);
      if (!openRef.current) setHasUnread(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const onSubmitEmailGate = async (e: FormEvent) => {
    e.preventDefault();
    await ensurePublicSession();
  };

  if (process.env.NODE_ENV === "development") {
    console.log("[chat-widget] render check", {
      mounted,
      forcedSurface,
      sessionStatus: status,
      hasSession: !!session?.user?.id,
      pathname: typeof window !== "undefined" ? window.location.pathname : "ssr",
    });
  }

  if (!mounted) {
    return null;
  }

  return createPortal(
    <div
      style={{
        position: "fixed",
        bottom: "24px",
        right: "24px",
        zIndex: 2147483647,
        isolation: "isolate",
      }}
    >
      <div
        className={`flex flex-col items-end transition-all duration-200 ${
          open ? "gap-3" : "gap-0"
        }`}
      >
        {open ? (
          <div
            role="dialog"
            aria-label="AI Help Assistant"
            className="flex max-h-[70vh] w-screen max-w-[100vw] flex-col overflow-hidden rounded-xl border border-(--border-subtle) bg-(--bg-surface-elev) shadow-xl sm:h-[520px] sm:w-96 sm:max-w-none"
          >
            <div className="flex shrink-0 items-start justify-between gap-2 border-b border-(--border-subtle) px-4 py-3">
              <div>
                <h2 className="text-sm font-semibold text-(--text-primary)">AI Help Assistant</h2>
                <p className="text-xs text-(--text-muted)">Powered by Knowledge Base</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="rounded-lg p-1.5 text-(--text-muted) hover:bg-(--nav-hover)"
                aria-label="Close chat"
              >
                <IconX size={18} />
              </button>
            </div>

            <div
              ref={threadRef}
              className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3"
            >
              {!useAppFlow && !emailGateDone ? (
                <form
                  onSubmit={onSubmitEmailGate}
                  className="rounded-lg border border-(--border-subtle) bg-(--bg-surface) p-3"
                >
                  <p className="text-sm font-medium text-(--text-primary)">
                    Enter your email to start chatting
                  </p>
                  <label htmlFor="chat-widget-email" className="sr-only">
                    Email
                  </label>
                  <input
                    id="chat-widget-email"
                    type="email"
                    autoComplete="email"
                    value={visitorEmail}
                    onChange={(e) => setVisitorEmail(e.target.value)}
                    className="mt-2 w-full rounded-lg border border-(--border-subtle) bg-(--bg-surface-elev) px-3 py-2 text-sm"
                    placeholder="you@company.com"
                  />
                  <button
                    type="submit"
                    disabled={creatingSession || visitorEmail.trim().length < 3}
                    className="mt-2 inline-flex h-9 w-full items-center justify-center rounded-lg bg-(--color-primary) text-sm font-medium text-white disabled:opacity-50"
                  >
                    {creatingSession ? <Spinner size="sm" /> : "Start chat"}
                  </button>
                </form>
              ) : null}

              {lines.length === 0 && (useAppFlow || emailGateDone) ? (
                <div className="rounded-lg border border-dashed border-(--border-subtle) bg-(--bg-surface) p-3 text-sm">
                  <p className="font-medium text-(--text-primary)">
                    Hi! I&apos;m the Relitrue support assistant.
                  </p>
                  <p className="mt-1 text-(--text-muted)">
                    Ask me anything about billing, requests, approvals, and more.
                  </p>
                  {titles.length > 0 ? (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {titles.map((t) => (
                        <button
                          key={t}
                          type="button"
                          onClick={() => void sendMessage(t)}
                          disabled={loading || (!useAppFlow && !emailGateDone)}
                          className="rounded-full border border-(--border-subtle) bg-(--bg-surface-elev) px-2.5 py-1 text-xs text-(--text-secondary) hover:bg-(--nav-hover) disabled:opacity-50"
                        >
                          {t}
                        </button>
                      ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {lines.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[90%] rounded-2xl px-3 py-2 text-sm ${
                      m.role === "user"
                        ? "bg-(--nav-active) text-(--text-primary)"
                        : "border border-(--border-subtle) bg-(--bg-surface) text-(--text-primary)"
                    }`}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    <p className="mt-1 text-[10px] text-(--text-muted)">{formatRelativeTime(m.createdAt)}</p>
                    {m.role === "assistant" && m.sources.length > 0 ? (
                      <div className="mt-2 flex flex-wrap gap-1 border-t border-(--border-subtle) pt-2">
                        {m.sources.map((s) => (
                          <Link
                            key={s.id}
                            href={`${articleBase}/${s.slug}`}
                            className="rounded-md border border-(--border-subtle) bg-(--bg-surface-elev) px-2 py-0.5 text-[11px] font-medium text-(--color-primary) hover:bg-(--nav-hover)"
                          >
                            {s.title}
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              {loading ? (
                <div className="flex justify-start">
                  <div className="rounded-2xl border border-(--border-subtle) bg-(--bg-surface) px-3 py-2">
                    <TypingDots />
                  </div>
                </div>
              ) : null}
            </div>

            {error ? <p className="shrink-0 px-3 text-xs text-(--color-danger)">{error}</p> : null}

            <div className="shrink-0 border-t border-(--border-subtle) p-3">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sendMessage(draft);
                }}
                className="flex gap-2"
              >
                <label htmlFor="chat-widget-input" className="sr-only">
                  Message
                </label>
                <textarea
                  id="chat-widget-input"
                  ref={textareaRef}
                  rows={2}
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  disabled={loading || (!useAppFlow && !emailGateDone) || creatingSession}
                  placeholder={
                    useAppFlow || emailGateDone
                      ? "Ask a question…"
                      : "Enter email above to chat"
                  }
                  className="min-h-[2.75rem] max-h-24 flex-1 resize-y rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
                />
                <button
                  type="submit"
                  disabled={
                    loading || draft.trim().length < 2 || (!useAppFlow && !emailGateDone) || creatingSession
                  }
                  className="inline-flex h-11 shrink-0 items-center justify-center self-end rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white disabled:opacity-50"
                >
                  {loading ? <Spinner size="sm" /> : "Send"}
                </button>
              </form>
              <p className="mt-2 text-center text-[11px] text-(--text-muted)">
                Need hands-on help?{" "}
                <Link href={contactHref} className="text-(--color-primary) hover:underline">
                  Contact support
                </Link>
              </p>
            </div>
          </div>
        ) : null}

        <button
          type="button"
          onClick={() => void openPanel()}
          title="Quick question? Ask AI"
          aria-label="Quick question? Ask AI — open AI Help Assistant"
          className={`relative inline-flex h-14 w-14 items-center justify-center rounded-full bg-(--color-primary) text-white shadow-lg ring-2 ring-white/20 transition hover:bg-(--color-primary-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-soft) ${
            pulse ? "animate-pulse" : ""
          }`}
        >
          <IconChatBubble size={26} className="text-white" />
          {hasUnread ? (
            <span className="absolute top-2 right-2 h-2.5 w-2.5 rounded-full bg-(--color-danger) ring-2 ring-(--color-primary)" />
          ) : null}
        </button>
      </div>
    </div>,
    document.body
  );
}
