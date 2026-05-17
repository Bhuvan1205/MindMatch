"use client";

import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Loader2, MessageCircle, RefreshCw, Send, Users2 } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mindmatchApi } from "@/lib/api/mindmatch";
import type { UserConnection } from "@/lib/api/types";

export function ConnectionsScreen() {
  const queryClient = useQueryClient();
  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: mindmatchApi.listConnections,
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

  return (
    <section className="min-h-[calc(100vh-4rem)] px-5 py-10 sm:px-8">
      <div className="container max-w-5xl">
        <div className="mb-8">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Direct Interactions</p>
          <h1 className="mt-3 text-3xl font-medium tracking-tight">Your match conversations</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">
            Direct messages are available after a match request is accepted. Experience-based answers remain separate from direct messages.
          </p>
        </div>

        <div className="grid gap-4">
          {connections.map((connection) => (
            <ConnectionCard
              key={connection.connection_id}
              connection={connection}
              onAccept={() => acceptMutation.mutate({ connection_id: connection.connection_id })}
              accepting={
                acceptMutation.isPending &&
                acceptMutation.variables?.connection_id === connection.connection_id
              }
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ConnectionCard({
  connection,
  onAccept,
  accepting,
}: {
  connection: UserConnection;
  onAccept: () => void;
  accepting: boolean;
}) {
  const [message, setMessage] = React.useState("");
  const [isThreadOpen, setIsThreadOpen] = React.useState(false);
  const threadQuery = useQuery({
    queryKey: ["direct-messages", connection.connection_id],
    queryFn: () => mindmatchApi.getDirectMessages(connection.connection_id),
    enabled: connection.status === "accepted" && isThreadOpen,
  });
  const sendMutation = useMutation({
    mutationFn: mindmatchApi.sendDirectMessage,
    onSuccess: () => {
      setMessage("");
      threadQuery.refetch();
    },
  });

  return (
    <article className="rounded-lg border bg-card/80 p-5 shadow-sm">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <MessageCircle className="size-4 text-primary" />
            <h2 className="font-semibold">Connection {connection.connection_id.slice(0, 8)}</h2>
          </div>
          <p className="mt-1 text-sm capitalize text-muted-foreground">
            {connection.status}
            {connection.is_incoming ? " incoming request" : " outgoing request"}
          </p>
        </div>
        {connection.status === "pending" && connection.is_incoming ? (
          <Button type="button" onClick={onAccept} disabled={accepting}>
            {accepting ? <Loader2 className="size-4 animate-spin" /> : null}
            Accept
          </Button>
        ) : null}
      </div>

      {connection.status === "accepted" ? (
        <div className="mt-5 border-t pt-5">
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-between px-0 hover:bg-transparent"
            onClick={() => setIsThreadOpen((open) => !open)}
          >
            <span>{isThreadOpen ? "Hide conversation" : "Open conversation"}</span>
            <ChevronDown className={`size-4 transition-transform ${isThreadOpen ? "rotate-180" : ""}`} />
          </Button>

          {isThreadOpen ? (
            <>
              <div className="mt-4 max-h-80 space-y-3 overflow-y-auto">
                {threadQuery.isPending ? (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Loading conversation...
                  </div>
                ) : null}
                {(threadQuery.data?.messages ?? []).map((item) => (
                  <div key={item.message_id} className="rounded-lg bg-muted/60 px-3 py-2 text-sm">
                    <p className="text-xs text-muted-foreground">{new Date(item.created_at).toLocaleString()}</p>
                    <p className="mt-1 leading-6">{item.message}</p>
                  </div>
                ))}
                {threadQuery.data?.messages.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No messages yet.</p>
                ) : null}
              </div>
              <div className="mt-4 flex gap-2">
                <Input
                  value={message}
                  onChange={(event) => setMessage(event.target.value)}
                  placeholder="Write a message..."
                />
                <Button
                  type="button"
                  size="icon"
                  disabled={!message.trim() || sendMutation.isPending}
                  onClick={() => sendMutation.mutate({ connection_id: connection.connection_id, message })}
                >
                  {sendMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </Button>
              </div>
            </>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
