"use client";

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { AlertCircle, ArrowLeft, ArrowRight, Loader2, RefreshCw, Search, type LucideIcon } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ScoreRing } from "@/components/matches/score-ring";
import { IdentityAvatar } from "@/components/shared/identity-avatar";
import { Button } from "@/components/ui/button";
import { getApiErrorMessage } from "@/lib/api/errors";
import { mindmatchApi } from "@/lib/api/mindmatch";
import type { RankedMatch } from "@/lib/api/types";
import { queryKeys } from "@/lib/query/query-keys";
import { softReveal, staggerContainer } from "@/components/motion/motion-config";
import { useProfileStore } from "@/stores/profile-store";

export function MatchesScreen() {
  const { profile, matches, setMatches } = useProfileStore();

  const matchesQuery = useQuery({
    queryKey: profile ? queryKeys.matches(profile.profile_id) : ["matches", "missing-profile"],
    queryFn: async () => {
      if (!profile) {
        throw new Error("A generated profile is required before finding matches.");
      }

      const response = await mindmatchApi.performSimilarity({ user_id: profile.profile_id });
      setMatches(response);
      return response;
    },
    enabled: Boolean(profile),
    retry: 1,
  });

  if (!profile) {
    return (
      <MatchesShell>
        <EmptyPanel
          icon={Search}
          title="No generated profile found"
          description="Please complete your profile to find your matches."
          action={
            <Button asChild>
              <Link href="/profile/preview">
                <ArrowLeft className="size-4" />
                Return to profile
              </Link>
            </Button>
          }
        />
      </MatchesShell>
    );
  }

  if (matchesQuery.isPending) {
    return (
      <MatchesShell>
        <div className="mx-auto max-w-md rounded-lg border bg-card/78 p-8 text-center shadow-soft backdrop-blur-xl">
          <Loader2 className="mx-auto size-8 animate-spin text-primary" aria-hidden="true" />
          <h1 className="mt-5 text-2xl font-semibold">Finding compatible learners</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground" role="status" aria-live="polite">
            Analyzing compatibility for {profile.name || "your profile"}.
          </p>
        </div>
      </MatchesShell>
    );
  }

  if (matchesQuery.error) {
    return (
      <MatchesShell>
        <EmptyPanel
          icon={AlertCircle}
          title="Matching paused"
          description={getApiErrorMessage(matchesQuery.error)}
          action={
            <Button type="button" onClick={() => matchesQuery.refetch()}>
              <RefreshCw className="size-4" />
              Retry matching
            </Button>
          }
        />
      </MatchesShell>
    );
  }

  const data = matchesQuery.data ?? matches;
  const rankedMatches = data?.ranked_matches ?? [];

  if (rankedMatches.length === 0) {
    return (
      <MatchesShell>
        <EmptyPanel
          icon={Search}
          title="No matches returned"
          description="We couldn't find any matches at this time."
          action={
            <Button type="button" variant="secondary" onClick={() => matchesQuery.refetch()}>
              <RefreshCw className="size-4" />
              Run again
            </Button>
          }
        />
      </MatchesShell>
    );
  }

  return (
    <MatchesShell>
      <motion.div variants={staggerContainer} initial="initial" animate="animate" className="container max-w-6xl">
        <motion.div variants={softReveal} className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
            Your Top Matches
          </p>
          <h1 className="mt-3 text-pretty text-3xl font-medium tracking-tight sm:text-4xl">
            People likely to think well with <span className="capitalize">{data?.query_user || profile.name || "you"}</span>
          </h1>
            We've found people who share your goals, learning strategies, and cognitive patterns.
        </motion.div>

        <motion.div variants={staggerContainer} className="mt-10 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {rankedMatches.map((match, index) => (
            <MatchCard key={`${match.user}-${index}`} match={match} index={index} />
          ))}
        </motion.div>
      </motion.div>
    </MatchesShell>
  );
}

function MatchCard({ match, index }: { match: RankedMatch; index: number }) {
  return (
    <motion.article
      variants={softReveal}
      aria-labelledby={`match-${index}-title`}
      className="group flex min-h-72 flex-col rounded-lg border bg-card/78 p-5 shadow-sm backdrop-blur-xl transition-all hover:-translate-y-1 hover:border-primary/30 hover:shadow-soft"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <IdentityAvatar name={match.user} />
          <div>
            <h2 id={`match-${index}-title`} className="font-semibold capitalize">{match.user}</h2>
            <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">Rank {index + 1}</p>
          </div>
        </div>
        <ScoreRing score={match.score} />
      </div>

      <p className="mt-5 line-clamp-4 flex-1 text-sm leading-6 text-muted-foreground">{match.reason}</p>

      <Button asChild variant="secondary" className="mt-5 w-full">
        <Link href={`/matches/${index}`}>
          View details
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </motion.article>
  );
}

function MatchesShell({ children }: { children: React.ReactNode }) {
  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-5 py-12 sm:px-8 md:py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_20%_10%,hsl(var(--primary)/0.13),transparent_28rem),radial-gradient(circle_at_82%_20%,hsl(var(--accent)/0.28),transparent_26rem)]" />
      {children}
    </section>
  );
}

function EmptyPanel({
  title,
  description,
  action,
  icon: Icon,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
  icon: LucideIcon;
}) {
  return (
    <div className="container flex min-h-[calc(100vh-12rem)] items-center justify-center">
      <EmptyState icon={Icon} title={title} description={description} action={action} className="max-w-md" />
    </div>
  );
}
