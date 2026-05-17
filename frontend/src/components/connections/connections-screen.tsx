"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Loader2, MessageCircle, RefreshCw, Send, Users2, Check } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mindmatchApi } from "@/lib/api/mindmatch";
import type { UserConnection } from "@/lib/api/types";

export function ConnectionsScreen() {
  const queryClient = useQueryClient();
  const [activeConnectionId, setActiveConnectionId] = React.useState<string | null>(null);

  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: mindmatchApi.listConnections,
    refetchInterval: 3000,
  });

  const acceptMutation = useMutation({
    mutationFn: mindmatchApi.acceptConnection,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["connections"] });
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const connections = connectionsQuery.data?.connections ?? [];

  if (connectionsQuery.isPending) {
    return (
      <section className="flex min-h-[calc(100vh-4rem)] items-center justify-center">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </section>
    );
  }

  if (connections.length === 0) {
    return (
      <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-20">
        <EmptyState
          icon={Users2}
          title="No direct connections yet"
          description="Request a chat from one of your suggested matches to start a direct interaction."
          action={
            <Button type="button" variant="secondary" onClick={() => connectionsQuery.refetch()}>
              <RefreshCw className="size-4" />
              Refresh
            </Button>
          }
          className="max-w-md"
        />
      </section>
    );
  }

  const activeConnection = connections.find((c) => c.connection_id === activeConnectionId);

  return (
    <section className="flex h-[calc(100vh-4rem)] overflow-hidden bg-background">
      {/* Sidebar: Connection List */}
      <div className="flex w-full flex-col border-r bg-card/30 sm:w-80 md:w-96 shrink-0">
        <div className="flex items-center justify-between border-b px-6 py-5 backdrop-blur-xl">
          <h1 className="text-xl font-semibold tracking-tight">Chats</h1>
          <Button variant="ghost" size="icon" onClick={() => connectionsQuery.refetch()}>
            <RefreshCw className={`size-4 ${connectionsQuery.isFetching ? 'animate-spin' : ''}`} />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          {connections.map((connection) => {
            const isAccepted = connection.status === "accepted";
            const isPendingIncoming = connection.status === "pending" && connection.is_incoming;
            const isPendingOutgoing = connection.status === "pending" && !connection.is_incoming;
            const isActive = activeConnectionId === connection.connection_id;

            return (
              <div
                key={connection.connection_id}
                onClick={() => {
                  if (isAccepted) setActiveConnectionId(connection.connection_id);
                }}
                className={`mb-2 flex items-center justify-between rounded-xl p-3 transition-colors ${
                  isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-muted/50 border border-transparent"
                } ${isAccepted ? "cursor-pointer" : "cursor-default opacity-80"}`}
              >
                <div className="flex items-center gap-4 overflow-hidden">
                  <div className={`flex size-11 shrink-0 items-center justify-center rounded-full ${isActive ? "bg-primary text-primary-foreground" : "bg-primary/10 text-primary"}`}>
                    <MessageCircle className="size-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">Connection {connection.connection_id.slice(0, 8)}</p>
                    <p className="truncate text-xs text-muted-foreground capitalize mt-0.5">
                      {isAccepted ? "Active Chat" : isPendingIncoming ? "Incoming request" : "Outgoing request"}
                    </p>
                  </div>
                </div>

                {isPendingIncoming && (
                  <Button
                    size="sm"
                    className="ml-2 shrink-0 rounded-full h-8 text-xs px-3 shadow-none"
                    disabled={acceptMutation.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      acceptMutation.mutate({ connection_id: connection.connection_id });
                    }}
                  >
                    {acceptMutation.isPending && acceptMutation.variables?.connection_id === connection.connection_id ? (
                      <Loader2 className="size-3 animate-spin mr-1.5" />
                    ) : (
                      <Check className="size-3 mr-1.5" />
                    )}
                    Accept
                  </Button>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Main Chat Area */}
      <div className="flex flex-1 flex-col bg-background relative max-w-full">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_50%_50%,hsl(var(--primary)/0.03),transparent_40rem)]" />
        {activeConnection ? (
          <ChatThread connection={activeConnection} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center text-center p-8">
            <div className="flex size-20 items-center justify-center rounded-full bg-primary/5 text-primary/40 mb-6">
              <MessageCircle className="size-10" />
            </div>
            <h2 className="text-2xl font-semibold tracking-tight">MindMatch Messages</h2>
            <p className="mt-3 text-sm text-muted-foreground max-w-sm leading-relaxed">
              Select an active connection from the left menu to start messaging. Direct messages let you get to know your matches better in real-time.
            </p>
          </div>
        )}
      </div>
    </section>
  );
}

function ChatThread({ connection }: { connection: UserConnection }) {
  const [message, setMessage] = React.useState("");
  const scrollRef = React.useRef<HTMLDivElement>(null);
  
  const threadQuery = useQuery({
    queryKey: ["direct-messages", connection.connection_id],
    queryFn: () => mindmatchApi.getDirectMessages(connection.connection_id),
    refetchInterval: 3000,
  });

  const sendMutation = useMutation({
    mutationFn: mindmatchApi.sendDirectMessage,
    onSuccess: () => {
      setMessage("");
      threadQuery.refetch();
    },
  });

  React.useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [threadQuery.data?.messages]);

  return (
    <div className="flex h-full flex-col">
      {/* Chat Header */}
      <div className="flex items-center gap-4 border-b bg-card/50 px-6 py-4 backdrop-blur-md">
        <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
          <MessageCircle className="size-5" />
        </div>
        <div>
          <h2 className="font-semibold text-foreground tracking-tight">Connection {connection.connection_id.slice(0, 8)}</h2>
          <p className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <span className="relative flex size-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-green-400 opacity-75"></span>
              <span className="relative inline-flex size-2 rounded-full bg-green-500"></span>
            </span>
            Connected
          </p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-6" ref={scrollRef}>
        {threadQuery.isPending ? (
          <div className="flex h-full items-center justify-center">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="flex flex-col space-y-4">
            {(threadQuery.data?.messages ?? []).map((item) => {
              return (
                <div key={item.message_id} className="max-w-[85%] rounded-2xl rounded-tl-sm bg-muted/60 p-4 text-sm shadow-sm border border-border/50">
                  <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                  <p className="leading-relaxed text-foreground">{item.message}</p>
                </div>
              );
            })}
            {threadQuery.data?.messages.length === 0 ? (
              <div className="flex h-full items-center justify-center pt-20">
                <p className="rounded-full bg-muted/40 px-5 py-2 text-xs font-medium text-muted-foreground">
                  No messages yet. Say hello!
                </p>
              </div>
            ) : null}
          </div>
        )}
      </div>

      {/* Message Input */}
      <div className="border-t bg-card/50 p-4 backdrop-blur-md">
        <form 
          className="mx-auto flex max-w-4xl items-center gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (message.trim() && !sendMutation.isPending) {
              sendMutation.mutate({ connection_id: connection.connection_id, message });
            }
          }}
        >
          <Input
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            placeholder="Type your message..."
            className="flex-1 rounded-full border-muted-foreground/20 bg-background/80 px-6 py-6 shadow-sm focus-visible:ring-primary/30 text-base"
          />
          <Button
            type="submit"
            size="icon"
            className="size-12 shrink-0 rounded-full shadow-md transition-all hover:scale-105 active:scale-95"
            disabled={!message.trim() || sendMutation.isPending}
          >
            {sendMutation.isPending ? <Loader2 className="size-5 animate-spin" /> : <Send className="size-5" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
