"use client";

import * as React from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { AnimatePresence, motion } from "framer-motion";
import { AlertCircle, CheckCircle2, Loader2, MessageSquareReply, Send, Sparkles, SquareX, User as UserIcon } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mindmatchApi } from "@/lib/api/mindmatch";
import type { ChatExchange, ChatHistoryResponse } from "@/lib/api/types";
import { cn } from "@/lib/utils";
import { useChatStore } from "@/stores/chat-store";
import { useProfileStore } from "@/stores/profile-store";

type DisplayMessage =
  | { role: "user"; text: string; id: string }
  | {
      role: "assistant";
      text: string;
      id: string;
      streaming?: boolean;
      kind?: string;
      targetName?: string | null;
      question?: string | null;
    };

function MarkdownContent({ content }: { content: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        p: ({ children }) => <p className="mb-2 leading-relaxed last:mb-0">{children}</p>,
        ul: ({ children }) => <ul className="mb-2 ml-0.5 space-y-1.5 last:mb-0">{children}</ul>,
        ol: ({ children }) => <ol className="mb-2 ml-0.5 space-y-1.5 last:mb-0">{children}</ol>,
        li: ({ children }) => (
          <li className="flex items-start gap-2 text-sm leading-relaxed">
            <span className="mt-[7px] block size-1.5 shrink-0 rounded-full bg-primary/60" />
            <span className="flex-1">{children}</span>
          </li>
        ),
        code: ({ className, children }) =>
          className?.startsWith("language-") ? (
            <code className="block overflow-x-auto font-mono text-xs leading-relaxed">{children}</code>
          ) : (
            <code className="rounded bg-muted/80 px-1.5 py-0.5 font-mono text-xs">{children}</code>
          ),
        pre: ({ children }) => (
          <pre className="mb-3 overflow-hidden rounded-lg border border-border/60 bg-muted px-4 py-3 last:mb-0">
            {children}
          </pre>
        ),
        blockquote: ({ children }) => (
          <blockquote className="mb-2 border-l-2 border-primary/40 pl-3 text-sm italic text-muted-foreground last:mb-0">
            {children}
          </blockquote>
        ),
        a: ({ href, children }) => (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-blue-600 underline underline-offset-4 transition-colors hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
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
      <div className="self-end flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/20 text-primary ring-1 ring-primary/30">
        <UserIcon className="size-3.5" />
      </div>
    </motion.div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center gap-1 py-0.5">
      {[0, 1, 2].map((i) => (
        <motion.span
          key={i}
          className="block size-1.5 rounded-full bg-muted-foreground"
          animate={{ opacity: [0.3, 1, 0.3], y: [0, -3, 0] }}
          transition={{ duration: 0.8, repeat: Infinity, delay: i * 0.15, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

function RelayStatusCard({
  kind,
  targetName,
  question,
}: {
  kind?: string;
  targetName?: string | null;
  question?: string | null;
}) {
  const resolved = kind === "relay_answer";
  const inbound = kind === "relay_inbound_prompt";
  const title = resolved
    ? `Advice received from ${targetName || "your match"}`
    : inbound
      ? "Advice request waiting for your reply"
      : `Waiting on ${targetName || "your match"}`;
  const subtitle = resolved
    ? "Delivered in your Matcha chat"
    : inbound
      ? "Reply here and Matcha will pass it back"
      : "Reply will appear here as soon as Matcha receives it";

  return (
    <div
      className={cn(
        "mb-3 rounded-xl border px-3 py-2",
        resolved ? "border-emerald-300/50 bg-emerald-500/10" : "border-primary/20 bg-primary/5",
      )}
    >
      <div className="flex items-center gap-2 text-xs font-medium">
        {resolved ? (
          <CheckCircle2 className="size-3.5 text-emerald-600" />
        ) : (
          <MessageSquareReply className="size-3.5 text-primary" />
        )}
        <span>{title}</span>
      </div>
      <p className="mt-1 text-[11px] text-muted-foreground">{subtitle}</p>
      {question ? (
        <p className="mt-2 text-xs leading-5 text-foreground/80">
          <span className="font-medium">Question:</span> {question}
        </p>
      ) : null}
    </div>
  );
}

function AssistantBubble({
  text,
  id,
  streaming,
  kind,
  targetName,
  question,
}: {
  text: string;
  id: string;
  streaming?: boolean;
  kind?: string;
  targetName?: string | null;
  question?: string | null;
}) {
  const isRelayCard = kind === "relay_pending" || kind === "relay_answer" || kind === "relay_inbound_prompt";
  return (
    <motion.div
      key={id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.22 }}
      className="flex items-start gap-2.5"
    >
      <div className="max-w-[84%] rounded-2xl rounded-tl-sm border border-border/60 bg-card/90 px-4 py-3 text-sm shadow-sm backdrop-blur-sm">
        {isRelayCard ? <RelayStatusCard kind={kind} targetName={targetName} question={question} /> : null}
        {text ? (
          <>
            <MarkdownContent content={text} />
            {streaming ? (
              <span className="mt-1 inline-block h-4 w-0.5 animate-pulse rounded-full bg-primary/70 align-middle" />
            ) : null}
          </>
        ) : (
          <TypingDots />
        )}
      </div>
    </motion.div>
  );
}

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
  history: { user_message: string; assistant_message: string }[],
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
      if (!line.startsWith("data: ")) continue;
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

function hydrateMessages(history: ChatHistoryResponse, greetingText: string): DisplayMessage[] {
  if (history.messages?.length) {
    return history.messages.map((message) => ({
      role: message.role,
      text: message.text,
      id: message.id,
      kind: message.kind,
      targetName: message.target_name,
      question: message.question,
    }));
  }

  const hydrated = history.exchanges.flatMap((ex: ChatExchange, index: number) => [
    { role: "user" as const, text: ex.user_message, id: `history-user-${index}` },
    { role: "assistant" as const, text: ex.assistant_message, id: `history-assistant-${index}` },
  ]);

  return hydrated.length > 0 ? hydrated : [{ role: "assistant", text: greetingText, id: `greeting-${Date.now()}` }];
}

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

  const applyHistory = React.useCallback(
    (history: ChatHistoryResponse) => {
      setSessionId(history.session_id);
      setExchanges(history.exchanges);
      setMessages(hydrateMessages(history, greetingText));
    },
    [greetingText, setExchanges, setSessionId],
  );

  function EndSessionButton() {
    const [confirm, setConfirm] = React.useState(false);

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
          className="gap-2 rounded-full border-border/60 bg-background/50 px-4 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur-xl transition-all hover:border-primary/20 hover:bg-primary/10 hover:text-primary"
        >
          <SquareX className="size-3.5" />
          End Session
        </Button>
      );
    }

    return (
      <div className="flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-1 shadow-sm backdrop-blur-xl">
        <span className="pl-2 text-[11px] font-medium text-muted-foreground">Save memory & end?</span>
        <Button type="button" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending} className="h-6 gap-1 rounded-full px-3 text-[11px]">
          {mutation.isPending ? <Loader2 className="size-3 animate-spin" /> : null}
          Yes
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setConfirm(false)} className="h-6 rounded-full px-3 text-[11px] hover:bg-muted/60">
          No
        </Button>
      </div>
    );
  }

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
            ? "border-amber-500/20 bg-amber-500/90 text-white hover:bg-amber-600/90"
            : "bg-background/50 text-muted-foreground backdrop-blur-xl hover:border-primary/20 hover:bg-primary/10 hover:text-primary",
        )}
      >
        <Sparkles className="size-3.5" />
        {temporary ? "Memory Off (Temp Chat)" : "Memory On"}
      </Button>
    );
  }

  const historyQuery = useQuery({
    queryKey: ["chat-history", temporary],
    queryFn: mindmatchApi.chatHistory,
    enabled: !temporary,
    staleTime: 0,
    refetchInterval: temporary || isStreaming ? false : 4000,
  });
  const isHistoryLoading = historyQuery.isLoading;

  React.useEffect(() => {
    if (historyQuery.data && !isStreaming && !temporary) {
      applyHistory(historyQuery.data);
    }
  }, [applyHistory, historyQuery.data, isStreaming, temporary]);

  React.useEffect(() => {
    if (temporary) {
      setMessages([{ role: "assistant", text: greetingText, id: `greeting-temp-${Date.now()}` }]);
    }
  }, [greetingText, temporary]);

  React.useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;

    setInput("");
    setStreamError(null);

    const userId = `user-${Date.now()}`;
    const assistantId = `assistant-${Date.now()}`;

    setMessages((prev) => [
      ...prev,
      { role: "user", text, id: userId },
      { role: "assistant", text: "", id: assistantId, streaming: true },
    ]);

    setIsStreaming(true);

    const historyPayload: { user_message: string; assistant_message: string }[] = [];
    if (temporary) {
      let currentExchange: { user_message?: string; assistant_message?: string } = {};
      for (const message of messages) {
        if (message.role === "user") {
          currentExchange.user_message = message.text;
        } else if (currentExchange.user_message) {
          currentExchange.assistant_message = message.text;
          historyPayload.push({
            user_message: currentExchange.user_message,
            assistant_message: currentExchange.assistant_message,
          });
          currentExchange = {};
        }
      }
    }

    try {
      let accumulated = "";
      for await (const token of streamChat(text, temporary, historyPayload)) {
        accumulated += token;
        const snapshot = accumulated;
        setMessages((prev) =>
          prev.map((message) =>
            message.id === assistantId ? { ...message, text: snapshot, streaming: true } : message,
          ),
        );
      }

      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId ? { ...message, streaming: false } : message,
        ),
      );
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : "Something went wrong.";
      setStreamError(errorMessage);
      setMessages((prev) =>
        prev.map((message) =>
          message.id === assistantId
            ? { ...message, text: "Sorry, something went wrong. Please try again.", streaming: false }
            : message,
        ),
      );
    } finally {
      setIsStreaming(false);
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      void handleSubmit(event as unknown as React.FormEvent);
    }
  }

  const showEmpty = !isHistoryLoading && messages.length === 0;

  return (
    <div className="relative flex h-full flex-col">
      {!showEmpty ? (
        <div className="absolute right-4 top-4 z-10 flex items-center gap-2 sm:right-8 sm:top-6">
          <TemporaryChatToggle />
          <EndSessionButton />
        </div>
      ) : null}

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-6 sm:px-8">
        <div className="mx-auto flex max-w-4xl flex-col gap-5">
          {isHistoryLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {messages.map((message) =>
                message.role === "user" ? (
                  <UserBubble key={message.id} text={message.text} id={message.id} />
                ) : (
                  <AssistantBubble
                    key={message.id}
                    text={message.text}
                    id={message.id}
                    streaming={message.streaming}
                    kind={message.kind}
                    targetName={message.targetName}
                    question={message.question}
                  />
                ),
              )}
            </AnimatePresence>
          )}

          {streamError ? (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive"
            >
              <AlertCircle className="size-3.5 shrink-0" />
              {streamError}
            </motion.div>
          ) : null}

          <div ref={bottomRef} />
        </div>
      </div>

      <div className="shrink-0 border-t border-border/40 bg-background/95 px-4 py-4 backdrop-blur-xl sm:px-8">
        <div className="mx-auto max-w-4xl">
          <form
            onSubmit={handleSubmit}
            className="flex items-end gap-3 rounded-2xl border border-border/60 bg-card/80 px-4 py-3 shadow-sm backdrop-blur-sm transition-all focus-within:border-primary/40 focus-within:shadow-md"
          >
            <Textarea
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isStreaming}
              placeholder="Ask Matcha anything, including asking a match for advice..."
              className="min-h-[2.5rem] max-h-40 resize-none border-0 bg-transparent p-0 text-sm shadow-none focus-visible:ring-0"
              rows={1}
            />
            <Button type="submit" size="icon" disabled={!input.trim() || isStreaming} className={cn("shrink-0 rounded-xl transition-all", !input.trim() && "opacity-40")}>
              {isStreaming ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
            </Button>
          </form>
          <p className="mt-2 text-center text-[11px] text-muted-foreground/50">
            Matcha can relay advice requests through a match without opening a direct conversation
          </p>
        </div>
      </div>
    </div>
  );
}
