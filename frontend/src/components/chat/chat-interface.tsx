"use client";

import * as React from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import {
  Send,
  Loader2,
  Sparkles,
  User as UserIcon,
  AlertCircle,
  SquareX,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { mindmatchApi } from "@/lib/api/mindmatch";
import { useChatStore } from "@/stores/chat-store";
import { useProfileStore } from "@/stores/profile-store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { ChatExchange } from "@/lib/api/types";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

type DisplayMessage =
  | { role: "user"; text: string; id: string }
  | { role: "assistant"; text: string; id: string; streaming?: boolean };

// ─────────────────────────────────────────────────────────────────────────────
// Markdown renderer — formats LLM output properly
// ─────────────────────────────────────────────────────────────────────────────

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        // Headings
        h1: ({ children }) => (
          <h1 className="mb-3 mt-4 text-base font-bold tracking-tight first:mt-0">
            {children}
          </h1>
        ),
        h2: ({ children }) => (
          <h2 className="mb-2 mt-4 text-sm font-bold tracking-tight first:mt-0">
            {children}
          </h2>
        ),
        h3: ({ children }) => (
          <h3 className="mb-1.5 mt-3 text-sm font-semibold first:mt-0">
            {children}
          </h3>
        ),

        // Paragraphs
        p: ({ children }) => (
          <p className="mb-2 leading-relaxed last:mb-0">{children}</p>
        ),

        // Lists
        ul: ({ children }) => (
          <ul className="mb-2 ml-0.5 space-y-1.5 last:mb-0">{children}</ul>
        ),
        ol: ({ children }) => (
          <ol className="mb-2 ml-0.5 space-y-1.5 last:mb-0">
            {children}
          </ol>
        ),
        li: ({ children }) => (
          <li className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-[7px] block size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span className="flex-1">{children}</span>
          </li>
        ),

        // Code — react-markdown v10: block code is always inside <pre>, inline is not
        code: ({ className, children }) => {
          const isBlock = className?.startsWith("language-");
          if (isBlock) {
            return (
              <code className="block overflow-x-auto font-mono text-xs leading-relaxed">
                {children}
              </code>
            );
          }
          return (
            <code className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-xs">
              {children}
            </code>
          );
        },

        // Code blocks wrapper
        pre: ({ children }) => (
          <pre className="mb-3 overflow-hidden rounded-lg border border-border/60 bg-muted px-4 py-3 last:mb-0">
            {children}
          </pre>
        ),

        // Blockquotes
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 text-sm text-muted-foreground italic last:mb-0">
            {children}
          </blockquote>
        ),

        // Horizontal rule
        hr: () => <hr className="my-3 border-border/60" />,

        // Strong / em
        strong: ({ children }) => (
          <strong className="font-semibold text-foreground">{children}</strong>
        ),
        em: ({ children }) => (
          <em className="italic text-muted-foreground">{children}</em>
        ),

        // Tables
        table: ({ children }) => (
          <div className="mb-3 overflow-x-auto rounded-lg border border-border/60 last:mb-0">
            <table className="w-full text-xs">{children}</table>
          </div>
        ),
        thead: ({ children }) => (
          <thead className="bg-muted/50 text-left font-semibold">{children}</thead>
        ),
        tbody: ({ children }) => (
          <tbody className="divide-y divide-border/40">{children}</tbody>
        ),
        tr: ({ children }) => <tr>{children}</tr>,
        th: ({ children }) => (
          <th className="px-3 py-2 text-xs font-semibold">{children}</th>
        ),
        td: ({ children }) => (
          <td className="px-3 py-2 text-xs leading-relaxed">{children}</td>
        ),

        // Links
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline underline-offset-4 hover:text-blue-800 transition-colors dark:text-blue-400 dark:hover:text-blue-300"
          >
            {children}
          </a>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Message bubbles
// ─────────────────────────────────────────────────────────────────────────────

function UserBubble({ text, id }: { text: string; id: string }) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.22 }}
      className="flex justify-end gap-2.5"
    >
      <div className="max-w-[80%] rounded-2xl rounded-br-sm bg-primary px-4 py-2.5 text-sm leading-relaxed text-primary-foreground shadow-sm">
        {text}
      </div>
      <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/30 self-end">
        <UserIcon className="size-3.5" />
      </div>
    </motion.div>
  );
}

function AssistantBubble({
  text,
  id,
  streaming,
}: {
  text: string;
  id: string;
  streaming?: boolean;
}) {
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex items-start gap-2.5"
    >
      {/* Content card */}
      <div className="max-w-[84%] rounded-2xl rounded-tl-sm border border-border/60 bg-card/90 px-4 py-3 text-sm shadow-sm backdrop-blur-sm">
        {text ? (
          <>
            <MarkdownContent content={text} />
            {streaming && (
              <span className="mt-1 inline-block h-4 w-0.5 animate-pulse rounded-full bg-primary/70 align-middle" />
            )}
          </>
        ) : (
          <TypingDots />
        )}
      </div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Typing dots (while waiting for first token)
// ─────────────────────────────────────────────────────────────────────────────

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{
            duration: 0.8,
            repeat: Infinity,
            delay: i * 0.15,
            ease: "easeInOut",
          }}
        />
      ))}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Empty state
// ─────────────────────────────────────────────────────────────────────────────



// ─────────────────────────────────────────────────────────────────────────────
// Streaming hook — calls POST /chat/stream with SSE
// ─────────────────────────────────────────────────────────────────────────────

function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem("mindmatch-auth");
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { state?: { token?: string | null } };
    return parsed.state?.token ?? null;
  } catch {
    return null;
  }
}

async function* streamChat(
  message: string,
  temporary: boolean,
  history: { user_message: string; assistant_message: string }[]
): AsyncGenerator<string, void, unknown> {
  const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";
  const token = getStoredToken();

  const response = await fetch(`${API_BASE}/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ message, temporary, history }),
  });

  if (!response.ok || !response.body) {
    throw new Error(`Stream failed: ${response.status}`);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const line of lines) {
      if (line.startsWith("data: ")) {
        const raw = line.slice(6);
        if (raw === "[DONE]") return;
        try {
          yield JSON.parse(raw) as string;
        } catch {
          yield raw;
        }
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────

export function ChatInterface() {
  const [input, setInput] = React.useState("");
  const [messages, setMessages] = React.useState<DisplayMessage[]>([]);
  const [isStreaming, setIsStreaming] = React.useState(false);
  const [streamError, setStreamError] = React.useState<string | null>(null);
  const bottomRef = React.useRef<HTMLDivElement>(null);

  const { setSessionId, setExchanges, clearChat, temporary, toggleTemporary } = useChatStore();
  const { profile } = useProfileStore();

  const greetingText = React.useMemo(() => {
    const nameStr = profile?.name ? ` ${profile.name}` : " there";
    return `Hey${nameStr}! What's up?`;
  }, [profile]);

  // ── End Session Component ─────────────────────────────────────────────────
  // Behaviour:
  //   • temporary=true  → instant local clear, NO API call, NO summarization (zero token cost)
  //   • temporary=false → show "Save memory & end?" confirm, then call /chat/end-session which
  //                        compresses the session into a long-term episodic memory summary
  function EndSessionButton() {
    const [confirm, setConfirm] = React.useState(false);

    // Only used in memory-on mode
    const mutation = useMutation({
      mutationFn: mindmatchApi.chatEndSession,
      onSuccess: () => {
        clearChat();
        setMessages([{ role: "assistant", text: greetingText, id: `greeting-${Date.now()}` }]);
        setConfirm(false);
      },
      onError: () => {
        clearChat();
        setMessages([{ role: "assistant", text: greetingText, id: `greeting-${Date.now()}` }]);
        setConfirm(false);
      },
    });

    if (!confirm) {
      return (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            if (temporary) {
              clearChat();
              setMessages([{ role: "assistant", text: greetingText, id: `greeting-${Date.now()}` }]);
            } else {
              setConfirm(true);
            }
          }}
          className="gap-2 rounded-full border-border/60 bg-background/50 px-4 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-xl transition-all hover:bg-primary/10 hover:text-primary hover:border-primary/20"
        >
          <SquareX className="size-3.5" />
          End Session
        </Button>
      );
    }

    return (
      <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 shadow-sm backdrop-blur-xl">
        <span className="pl-2 text-[11px] font-medium text-muted-foreground">Save memory & end?</span>
        <Button
          type="button"
          size="sm"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="h-6 gap-1 rounded-full px-3 text-[11px]"
        >
          {mutation.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
          Yes
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setConfirm(false)}
          className="h-6 rounded-full px-3 text-[11px] hover:bg-muted/60"
        >
          No
        </Button>
      </div>
    );
  }

  // ── Temporary Chat Toggle ──────────────────────────────────────────────────
  function TemporaryChatToggle() {
    return (
      <Button
        type="button"
        variant={temporary ? "default" : "outline"}
        size="sm"
        onClick={toggleTemporary}
        className={cn(
          "gap-2 rounded-full border-border/60 px-4 text-xs font-medium shadow-sm transition-all",
          temporary
            ? "bg-amber-500/90 text-white hover:bg-amber-600/90 border-amber-500/20"
            : "bg-background/50 text-muted-foreground hover:bg-primary/10 hover:text-primary hover:border-primary/20 backdrop-blur-xl"
        )}
      >
        <Sparkles className="size-3.5" />
        {temporary ? "Memory Off (Temp Chat)" : "Memory On"}
      </Button>
    );
  }

  // ── Load history on mount (disabled in temporary mode) ───────────────────
  const { isLoading: isHistoryLoading } = useQuery({
    queryKey: ["chat-history"],
    queryFn: async () => {
      const data = await mindmatchApi.chatHistory();
      setSessionId(data.session_id);
      setExchanges(data.exchanges);

      // Hydrate display messages from persistent history
      const hydrated: DisplayMessage[] = data.exchanges.flatMap(
        (ex: ChatExchange, i: number) => [
          { role: "user" as const, text: ex.user_message, id: `h-u-${i}` },
          { role: "assistant" as const, text: ex.assistant_message, id: `h-a-${i}` },
        ],
      );
      if (hydrated.length === 0) {
        hydrated.push({
          role: "assistant",
          text: greetingText,
          id: `greeting-${Date.now()}`
        });
      }
      setMessages(hydrated);
      return data;
    },
    staleTime: 0,
    // Never load DB history in temporary mode — that would defeat the purpose
    enabled: !temporary,
  });

  // When temporary mode is toggled ON, immediately show a fresh greeting
  // and wipe any loaded DB history from the display
  React.useEffect(() => {
    if (temporary) {
      setMessages([{ role: "assistant", text: greetingText, id: `greeting-temp-${Date.now()}` }]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temporary]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Send + stream ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setStreamError(null);

    // 1. Show user message immediately (optimistic UI)
    const userId = `u-${Date.now()}`;
    const assistantId = `a-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { role: "user", text, id: userId },
      { role: "assistant", text: "", id: assistantId, streaming: true },
    ]);

    setIsStreaming(true);

    // Prepare history for backend if temporary
    const historyPayload: { user_message: string; assistant_message: string }[] = [];
    if (temporary) {
      let currentExchange: { user_message?: string; assistant_message?: string } = {};
      for (const m of messages) {
        if (m.role === "user") {
          currentExchange.user_message = m.text;
        } else if (m.role === "assistant" && currentExchange.user_message) {
          currentExchange.assistant_message = m.text;
          historyPayload.push({
            user_message: currentExchange.user_message,
            assistant_message: currentExchange.assistant_message,
          });
          currentExchange = {};
        }
      }
    }

    // 2. Stream response token by token
    try {
      let accumulated = "";
      for await (const token of streamChat(text, temporary, historyPayload)) {
        accumulated += token;
        // Capture accumulated in closure properly
        const snapshot = accumulated;
        setMessages((prev) =>
          prev.map((m) =>
            m.id === assistantId
              ? { ...m, text: snapshot, streaming: true }
              : m,
          ),
        );
      }

      // 3. Mark streaming done
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId ? { ...m, streaming: false } : m,
        ),
      );
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Something went wrong.";
      setStreamError(msg);
      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? { ...m, text: "⚠️ Sorry, something went wrong. Please try again.", streaming: false }
            : m,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSubmit(e as unknown as React.FormEvent);
    }
  }

  const showEmpty = !isHistoryLoading && messages.length === 0;

  return (
    <div className="flex h-full flex-col relative">
      {/* Floating Header Actions */}
      {!showEmpty && (
        <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-8 sm:top-6">
          <TemporaryChatToggle />
          <EndSessionButton />
        </div>
      )}

      {/* ── Message area — the ONLY scrolling element ───────────────────────── */}
      {/*    min-h-0 is mandatory: flex children don't shrink below content     */}
      {/*    size by default, so without it overflow-y-auto has no effect.      */}
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {isHistoryLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((msg) =>
                msg.role === "user" ? (
                  <UserBubble key={msg.id} text={msg.text} id={msg.id} />
                ) : (
                  <AssistantBubble
                    key={msg.id}
                    text={msg.text}
                    id={msg.id}
                    streaming={msg.streaming}
                  />
                ),
              )}
            </AnimatePresence>
          )}

          {/* Error */}
          {streamError && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="size-3.5 shrink-0" />
              {streamError}
            </motion.div>
          )}

          <div ref={bottomRef} />
        </div>
      </div>

      {/* ── Input bar — fixed at bottom, never scrolls ──────────────────────── */}
      <div className="shrink-0 border-t border-border/40 bg-background/95 px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto max-w-4xl">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm transition-all focus-within:border-primary/40 focus-within:shadow-md"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask something… (Enter to send, Shift+Enter for newline)"
              className="min-h-[2.5rem] max-h-40 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
              rows={1}
            />
            <Button
              type="submit"
              size="icon"
              disabled={!input.trim() || isStreaming}
              className={cn(
                "shrink-0 rounded-xl transition-all",
                !input.trim() && "opacity-40",
              )}
            >
              {isStreaming ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
            Responses are personalized to your cognitive profile · Memories persist across sessions
          </p>
        </div>
      </div>
    </div>
  );
}
