"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { createPortal } from "react-dom";
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";

import { IconChatBubble, IconX } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/spinner";

type SourceArticle = { id: string; title: string; slug: string };

type ChatLine = {
  id: string;
  role: "user" | "assistant";
  content: string;
  sources: SourceArticle[];
  showSupportCta?: boolean;
  supportCtaLabel?: string;
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

/** Matches API `query` Zod schema (`max(500)`). */
const CHAT_QUERY_MAX_LENGTH = 500;

const MESSAGE_TOO_LONG =
  "Your message is too long. Please keep it under 500 characters.";

function hasSpanishIndicators(text: string): boolean {
  const lower = text.toLowerCase();
  return /\b(gracias|hola|ayuda|soporte|solicitud|por favor|puedo|necesito|entendido|perfecto)\b/u.test(
    lower
  );
}

export type ChatWidgetProps = {
  forcedSurface: "app" | "public";
};

export function ChatWidget({ forcedSurface }: ChatWidgetProps) {
  const router = useRouter();
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

  // Focus textarea when loading completes (after response arrives)
  const prevLoadingRef = useRef(false);
  useEffect(() => {
    if (prevLoadingRef.current === true && loading === false) {
      // Small delay to ensure the textarea is re-enabled before focusing
      const t = setTimeout(() => {
        if (textareaRef.current && !textareaRef.current.disabled) {
          textareaRef.current.focus();
        }
      }, 50);
      return () => clearTimeout(t);
    }
    prevLoadingRef.current = loading;
  }, [loading]);

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
        const errBody = (await res.json()) as {
          error?: { code?: string; message?: string };
        };
        if (errBody.error?.code === "VISITOR_EMAIL_REQUIRED") {
          setError("Email is required. Please enter it above and try again.");
          setLoading(false);
          return;
        }
        if (
          errBody.error?.code === "VALIDATION_ERROR" &&
          errBody.error?.message === "Invalid request body"
        ) {
          setError(MESSAGE_TOO_LONG);
          setLoading(false);
          return;
        }
      }

      if (res.status === 413) {
        setError(MESSAGE_TOO_LONG);
        setLoading(false);
        return;
      }

      if (!res.ok) {
        setError("Something went wrong. Please try again.");
        setLoading(false);
        return;
      }

      const j = (await res.json()) as {
        data?: {
          aiAnswer?: string | null;
          citedArticleIds?: string[];
          citedArticles?: SourceArticle[];
          resultCount?: number;
          responseType?: "greeting" | "answer" | "no_answer";
        };
      };
      const ai =
        j.data?.aiAnswer?.trim() && j.data.aiAnswer.trim().length > 0
          ? j.data.aiAnswer.trim()
          : EMPTY_KB;
      const citedArticleIds = Array.isArray(j.data?.citedArticleIds) ? j.data!.citedArticleIds! : [];
      const responseType = j.data?.responseType ?? "no_answer";
      const showSupportCta = responseType === "no_answer";
      const supportCtaLabel = hasSpanishIndicators(ai)
        ? "+ Crear una solicitud de soporte"
        : "+ Create a support request";
      const sources = Array.isArray(j.data?.citedArticles) ? j.data!.citedArticles! : [];

      setLines((prev) => [
        ...prev,
        {
          id: `a-${Date.now()}`,
          role: "assistant",
          content: ai,
          sources,
          showSupportCta,
          supportCtaLabel,
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

  const canSubmit =
    !loading &&
    !creatingSession &&
    (useAppFlow || emailGateDone) &&
    draft.trim().length >= 2 &&
    draft.length <= CHAT_QUERY_MAX_LENGTH;

  const handleSend = () => {
    void sendMessage(draft);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (canSubmit) {
        handleSend();
      }
    }
  };

  const onSubmitEmailGate = async (e: FormEvent) => {
    e.preventDefault();
    await ensurePublicSession();
  };

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
            style={{
              backgroundColor: "var(--bg-surface-elev, #1a1f2e)",
              width: "min(calc(100vw - 48px), 384px)",
            }}
            className="flex max-h-[85vh] flex-col overflow-hidden rounded-t-2xl rounded-b-none border border-(--border-subtle) shadow-xl sm:h-[520px] sm:max-h-none sm:max-w-none sm:rounded-xl"
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
                    {useAppFlow
                      ? "Hi! I'm the Relitrue support assistant."
                      : "Hi! How can I help you today?"}
                  </p>
                  <p className="mt-1 text-(--text-muted)">
                    {useAppFlow
                      ? "Ask me anything about your account, billing, requests, approvals, and workflows."
                      : "I can help you with questions about Relitrue. For account-specific help, you may need to sign in."}
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
                    {m.role === "assistant" && m.showSupportCta ? (
                      <div className="mt-2 border-t border-(--border-subtle) pt-2">
                        <button
                          type="button"
                          onClick={() => router.push(contactHref)}
                          className="inline-flex h-8 items-center justify-center rounded-lg border border-(--border-strong) bg-(--bg-surface-elev) px-3 text-xs font-medium text-(--text-primary) hover:bg-(--bg-surface-hover)"
                        >
                          {m.supportCtaLabel ?? "+ Create a support request"}
                        </button>
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
                  handleSend();
                }}
                className="flex flex-col gap-1"
              >
                <div className="flex items-start gap-2">
                  <div className="min-w-0 flex-1">
                    <label htmlFor="chat-widget-input" className="sr-only">
                      Message
                    </label>
                    <textarea
                      id="chat-widget-input"
                      ref={textareaRef}
                      rows={2}
                      maxLength={CHAT_QUERY_MAX_LENGTH}
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={handleKeyDown}
                      disabled={loading || (!useAppFlow && !emailGateDone) || creatingSession}
                      placeholder={
                        useAppFlow || emailGateDone
                          ? "Ask a question…"
                          : "Enter email above to chat"
                      }
                      className="min-h-[2.75rem] max-h-24 w-full resize-y rounded-lg border border-(--border-subtle) bg-(--bg-surface) px-3 py-2 text-sm"
                    />
                  </div>
                  <button
                    type="submit"
                    disabled={
                      loading ||
                      draft.trim().length < 2 ||
                      draft.length > CHAT_QUERY_MAX_LENGTH ||
                      (!useAppFlow && !emailGateDone) ||
                      creatingSession
                    }
                    className="inline-flex h-11 shrink-0 cursor-pointer items-center justify-center rounded-lg bg-(--color-primary) px-4 text-sm font-medium text-white disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {loading || creatingSession ? "Sending..." : "Send"}
                  </button>
                </div>
                <p className="hidden text-[11px] text-(--text-muted) sm:block">
                  Press Enter to send · Shift+Enter for new line
                </p>
                {draft.length > 0 ? (
                  <p
                    className={`text-right text-[11px] ${
                      draft.length >= 480
                        ? "text-(--color-danger)"
                        : draft.length > 400
                          ? "text-(--color-warning)"
                          : "text-(--text-muted)"
                    }`}
                    aria-live="polite"
                  >
                    {draft.length} / {CHAT_QUERY_MAX_LENGTH}
                  </p>
                ) : null}
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
          onClick={() => {
            if (open) {
              setOpen(false);
            } else {
              void openPanel();
            }
          }}
          title={open ? "Close chat" : "Quick question? Ask AI"}
          aria-label={
            open ? "Close AI Help Assistant" : "Quick question? Ask AI — open AI Help Assistant"
          }
          style={{
            backgroundColor: "var(--color-primary, #3b82f6)",
            color: "#ffffff",
          }}
          className={`relative inline-flex h-14 w-14 cursor-pointer items-center justify-center rounded-full text-white shadow-lg ring-2 ring-white/20 transition hover:bg-(--color-primary-hover) focus:outline-none focus-visible:ring-2 focus-visible:ring-(--color-primary-soft) ${
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
