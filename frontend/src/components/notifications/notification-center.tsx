"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, CheckCheck, Loader2, MessageCircle, Sparkles, UserCheck, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { mindmatchApi } from "@/lib/api/mindmatch";

export function NotificationCenter() {
  const [isOpen, setIsOpen] = React.useState(false);
  const [dismissedKeys, setDismissedKeys] = React.useState<string[]>([]);
  const [announcement, setAnnouncement] = React.useState<string | null>(null);
  const rootRef = React.useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: mindmatchApi.notifications,
    refetchInterval: 5000,
  });

  const markReadMutation = useMutation({
    mutationFn: mindmatchApi.markNotificationRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllReadMutation = useMutation({
    mutationFn: mindmatchApi.markAllNotificationsRead,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const groupedPeople = buildGroupedPeople(notificationsQuery.data);
  const visiblePeople = groupedPeople
    .map((person) => ({
      ...person,
      items: person.items.filter((item) => !dismissedKeys.includes(item.key)),
    }))
    .filter((person) => person.items.length > 0);
  const totalVisible = visiblePeople.reduce((sum, person) => sum + person.items.length, 0);
  const previousVisibleRef = React.useRef(0);

  React.useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  React.useEffect(() => {
    if (isOpen) {
      previousVisibleRef.current = totalVisible;
      return;
    }

    if (totalVisible > previousVisibleRef.current) {
      const delta = totalVisible - previousVisibleRef.current;
      setAnnouncement(delta === 1 ? "1 new notification" : `${delta} new notifications`);
      const timer = window.setTimeout(() => setAnnouncement(null), 3500);
      previousVisibleRef.current = totalVisible;
      return () => window.clearTimeout(timer);
    }

    previousVisibleRef.current = totalVisible;
  }, [isOpen, totalVisible]);

  function dismissItem(item: NotificationItem) {
    setDismissedKeys((current) => (current.includes(item.key) ? current : [...current, item.key]));
  }

  function dismissAllVisibleMessages() {
    const messageKeys = visiblePeople.flatMap((person) =>
      person.items.filter((item) => item.kind === "message").map((item) => item.key),
    );
    setDismissedKeys((current) => [...new Set([...current, ...messageKeys])]);
  }

  return (
    <div ref={rootRef} className="relative">
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label="Notifications"
        className={`relative text-muted-foreground hover:bg-muted/70 hover:text-foreground ${totalVisible > 0 ? "bg-primary/10 text-primary" : ""}`}
        onClick={() => setIsOpen((open) => !open)}
      >
        <Bell className={`size-4 ${totalVisible > 0 ? "animate-pulse" : ""}`} />
        {totalVisible > 0 ? (
          <>
            <span className="absolute inset-0 rounded-full ring-2 ring-primary/30 ring-offset-2 ring-offset-background" />
            <span className="absolute -right-0.5 -top-0.5 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground shadow-md">
              {totalVisible > 9 ? "9+" : totalVisible}
            </span>
          </>
        ) : null}
      </Button>

      {announcement && !isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.65rem)] z-50 w-56 rounded-xl border border-primary/20 bg-card/95 px-3 py-2 shadow-xl backdrop-blur-xl">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Sparkles className="size-4 text-primary" />
            {announcement}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Open notifications to review them.</p>
        </div>
      ) : null}

      {isOpen ? (
        <div className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-80 rounded-xl border bg-card/95 p-3 shadow-xl backdrop-blur-xl">
          <div className="flex items-center justify-between border-b pb-3">
            <div>
              <p className="text-sm font-semibold">Notifications</p>
              <p className="text-xs text-muted-foreground">Requests and messages from your matches</p>
            </div>
            {notificationsQuery.isFetching ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> : null}
          </div>

          <div className="mt-3 max-h-96 space-y-3 overflow-y-auto">
            {visiblePeople.some((person) => person.items.some((item) => item.kind === "message")) ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start gap-2"
                disabled={markAllReadMutation.isPending}
                onClick={() => {
                  dismissAllVisibleMessages();
                  markAllReadMutation.mutate();
                }}
              >
                {markAllReadMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
                Mark all messages as read
              </Button>
            ) : null}

            {visiblePeople.map((person) => (
              <div key={person.id} className="rounded-lg border bg-background/70 p-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="text-sm font-semibold">{person.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {person.items.length} update{person.items.length === 1 ? "" : "s"}
                  </p>
                </div>

                <div className="mt-3 space-y-2">
                  {person.items.map((item) => (
                    <Link
                      key={item.key}
                      href="/connections"
                      onClick={() => {
                        dismissItem(item);
                        if (item.kind === "message" && !item.readAt) {
                          markReadMutation.mutate({ message_id: item.messageId });
                        } else if (item.kind === "request") {
                          markReadMutation.mutate({
                            connection_id: item.connectionId,
                            notification_kind: "request",
                          });
                        } else if (item.kind === "accepted") {
                          markReadMutation.mutate({
                            connection_id: item.connectionId,
                            notification_kind: "accepted",
                          });
                        }
                        setIsOpen(false);
                      }}
                      className={`block rounded-md border px-3 py-2 transition-colors hover:border-primary/30 hover:bg-primary/5 ${
                        item.kind === "message" && !item.readAt ? "bg-primary/10 ring-1 ring-primary/20" : "bg-background/80"
                      }`}
                    >
                      <div className="flex gap-3">
                        {item.kind === "request" ? (
                          <UserPlus className="mt-0.5 size-4 shrink-0 text-primary" />
                        ) : item.kind === "accepted" ? (
                          <UserCheck className="mt-0.5 size-4 shrink-0 text-primary" />
                        ) : (
                          <MessageCircle className="mt-0.5 size-4 shrink-0 text-primary" />
                        )}

                        <div className="min-w-0">
                          <p className="text-sm font-medium">{item.title}</p>
                          {item.preview ? <p className="mt-1 truncate text-sm text-muted-foreground">{item.preview}</p> : null}
                          <p className="mt-1 text-xs text-muted-foreground">{new Date(item.timestamp).toLocaleString()}</p>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              </div>
            ))}

            {!notificationsQuery.isPending && visiblePeople.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-sm text-muted-foreground">
                No notifications yet.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type NotificationItem =
  | {
      key: string;
      kind: "request";
      connectionId: string;
      title: string;
      preview: null;
      timestamp: string;
    }
  | {
      key: string;
      kind: "accepted";
      connectionId: string;
      title: string;
      preview: null;
      timestamp: string;
    }
  | {
      key: string;
      kind: "message";
      title: string;
      preview: string;
      timestamp: string;
      readAt: string | null;
      messageId: string;
    };

function buildGroupedPeople(notifications: Awaited<ReturnType<typeof mindmatchApi.notifications>> | undefined) {
  if (!notifications) {
    return [];
  }

  const people = new Map<string, { id: string; name: string; items: NotificationItem[] }>();

  function ensurePerson(id: string, name: string | null) {
    if (!people.has(id)) {
      people.set(id, {
        id,
        name: name ?? "A matched user",
        items: [],
      });
    }

    return people.get(id)!;
  }

  for (const request of notifications.requests) {
    ensurePerson(request.requester_id, request.requester_name).items.push({
      key: `request-${request.connection_id}`,
      kind: "request",
      connectionId: request.connection_id,
      title: "Sent you a connection request",
      preview: null,
      timestamp: request.created_at,
    });
  }

  for (const accepted of notifications.accepted_requests) {
    ensurePerson(accepted.recipient_id, accepted.recipient_name).items.push({
      key: `accepted-${accepted.connection_id}`,
      kind: "accepted",
      connectionId: accepted.connection_id,
      title: "Accepted your connection request",
      preview: null,
      timestamp: accepted.accepted_at,
    });
  }

  for (const message of notifications.messages) {
    ensurePerson(message.sender_id, message.sender_name).items.push({
      key: `message-${message.message_id}`,
      kind: "message",
      title: "Sent you a message",
      preview: message.message,
      timestamp: message.created_at,
      readAt: message.read_at,
      messageId: message.message_id,
    });
  }

  return [...people.values()]
    .map((person) => ({
      ...person,
      items: person.items.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()),
    }))
    .sort((a, b) => {
      const aLatest = new Date(a.items[0]?.timestamp ?? 0).getTime();
      const bLatest = new Date(b.items[0]?.timestamp ?? 0).getTime();
      return bLatest - aLatest;
    });
}
