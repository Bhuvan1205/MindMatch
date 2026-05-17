"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AlertCircle, Compass, Loader2, Search } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ConnectionRequestButton } from "@/components/shared/connection-request-button";
import { IdentityAvatar } from "@/components/shared/identity-avatar";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { mindmatchApi } from "@/lib/api/mindmatch";
import type { SearchUserResult } from "@/lib/api/types";
import { queryKeys } from "@/lib/query/query-keys";

export function DiscoverScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialQuery = (searchParams.get("q") ?? "").trim();
  const [query, setQuery] = React.useState(initialQuery);
  const queryClient = useQueryClient();

  React.useEffect(() => {
    setQuery(initialQuery);
  }, [initialQuery]);

  const connectionsQuery = useQuery({
    queryKey: ["connections"],
    queryFn: mindmatchApi.listConnections,
    refetchInterval: 4000,
  });

  const searchQuery = useQuery({
    queryKey: queryKeys.userSearch(initialQuery),
    queryFn: () => mindmatchApi.searchUsers(initialQuery),
    enabled: initialQuery.trim().length > 0,
    staleTime: 15000,
  });

  const acceptedConnections = (connectionsQuery.data?.connections ?? []).filter((connection) => connection.status === "accepted");
  const pendingConnections = (connectionsQuery.data?.connections ?? []).filter((connection) => connection.status === "pending");

  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-5 py-12 sm:px-8 md:py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_10%,hsl(var(--primary)/0.12),transparent_28rem),radial-gradient(circle_at_88%_18%,hsl(var(--accent)/0.22),transparent_24rem)]" />

      <div className="container max-w-6xl">
        <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
          <div className="rounded-lg border bg-card/78 p-6 shadow-soft backdrop-blur-xl sm:p-8">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Discover people</p>
            <h1 className="mt-3 text-3xl font-medium tracking-tight sm:text-4xl">Search beyond your matches</h1>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground">
              Find people by name, interests, goals, or discussion topics and request a connection even if they were not surfaced by the matching system.
            </p>

            <DiscoverSearchForm
              initialQuery={initialQuery}
              query={query}
              setQuery={setQuery}
              onSubmit={(value) => {
                const trimmed = value.trim();
                router.push(trimmed ? `/discover?q=${encodeURIComponent(trimmed)}` : "/discover");
              }}
            />
          </div>

          <div className="rounded-lg border bg-background/70 p-6 shadow-sm backdrop-blur-xl">
            <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">Connection snapshot</p>
            <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
              <StatCard label="Active connections" value={acceptedConnections.length} helper="People you can message now" />
              <StatCard label="Pending requests" value={pendingConnections.length} helper="Waiting for acceptance" />
            </div>
            <Button asChild variant="outline" className="mt-5 w-full">
              <Link href="/connections">Open connections</Link>
            </Button>
          </div>
        </div>

        <div className="mt-8 rounded-lg border bg-card/70 p-6 shadow-soft backdrop-blur-xl">
          {initialQuery.trim().length === 0 ? (
            <EmptyState
              icon={Search}
              title="Search for people"
              description="Try a name, topic, or interest to discover users outside your ranked matches."
              className="max-w-md"
            />
          ) : searchQuery.isPending ? (
            <div className="flex min-h-52 items-center justify-center">
              <Loader2 className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : searchQuery.error ? (
            <EmptyState
              icon={AlertCircle}
              title="Search unavailable"
              description={searchQuery.error instanceof Error ? searchQuery.error.message : "Something went wrong while searching for users."}
              className="max-w-md"
            />
          ) : searchQuery.data && searchQuery.data.results.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {searchQuery.data.results.map((result) => (
                <SearchResultCard
                  key={result.profile_id}
                  result={result}
                  onConnected={() => {
                    queryClient.invalidateQueries({ queryKey: queryKeys.userSearch(initialQuery) });
                  }}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              icon={Compass}
              title="No people found"
              description={`No users matched "${initialQuery}". Try another name, topic, or area of interest.`}
              className="max-w-md"
            />
          )}
        </div>
      </div>
    </section>
  );
}

function DiscoverSearchForm({
  initialQuery,
  query,
  setQuery,
  onSubmit,
}: {
  initialQuery: string;
  query: string;
  setQuery: React.Dispatch<React.SetStateAction<string>>;
  onSubmit: (value: string) => void;
}) {
  return (
    <form
      className="mt-6 flex flex-col gap-3 sm:flex-row"
      onSubmit={(event) => {
        event.preventDefault();
        onSubmit(query);
      }}
    >
      <Input
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search by name, interests, goals, or topics"
        className="h-11 rounded-full bg-background/85 px-5"
      />
      <Button type="submit" className="h-11 rounded-full px-5" disabled={query.trim() === initialQuery && initialQuery.length > 0}>
        <Search className="size-4" />
        Search
      </Button>
    </form>
  );
}

function SearchResultCard({
  result,
  onConnected,
}: {
  result: SearchUserResult;
  onConnected: () => void;
}) {
  return (
    <article className="flex min-h-72 flex-col rounded-lg border bg-background/75 p-5 shadow-sm">
      <div className="flex items-start gap-3">
        <IdentityAvatar name={result.name || "User"} />
        <div className="min-w-0">
          <h2 className="truncate font-semibold">{result.name || "Unnamed user"}</h2>
          <p className="mt-1 text-xs uppercase tracking-[0.16em] text-muted-foreground">Open discovery</p>
        </div>
      </div>

      <div className="mt-5 flex-1 space-y-3 text-sm text-muted-foreground">
        <TagRow label="Interests" values={result.interests} />
        <TagRow label="Goals" values={result.goals} />
        <TagRow label="Topics" values={result.discussion_topics} />
      </div>

      <ConnectionRequestButton
        targetProfileId={result.profile_id}
        initialConnection={result.connection ?? null}
        idleLabel="Request connection"
        className="mt-5 w-full"
        onSuccess={onConnected}
      />
    </article>
  );
}

function TagRow({ label, values }: { label: string; values: string[] }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-foreground/70">{label}</p>
      <p className="mt-1 line-clamp-2 leading-6">{values.length > 0 ? values.join(", ") : "Not shared yet"}</p>
    </div>
  );
}

function StatCard({ label, value, helper }: { label: string; value: number; helper: string }) {
  return (
    <div className="rounded-lg border bg-card/70 p-4">
      <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-sm text-muted-foreground">{helper}</p>
    </div>
  );
}
