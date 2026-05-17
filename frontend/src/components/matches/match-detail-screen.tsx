"use client";

import * as React from "react";
import Link from "next/link";
import { useMutation } from "@tanstack/react-query";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Search, Sparkles } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ProfileComparisonReport } from "@/components/matches/profile-comparison-report";
import { ScoreRing } from "@/components/matches/score-ring";
import { IdentityAvatar } from "@/components/shared/identity-avatar";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { mindmatchApi } from "@/lib/api/mindmatch";
import { softReveal } from "@/components/motion/motion-config";
import { useProfileStore } from "@/stores/profile-store";

export function MatchDetailScreen({ matchIndex }: { matchIndex: string }) {
  const { matches, profile } = useProfileStore();
  const [experienceQuestion, setExperienceQuestion] = React.useState("");
  const index = Number.parseInt(matchIndex, 10);
  const match = Number.isInteger(index) ? matches?.ranked_matches[index] : undefined;
  const targetProfileId = match?.profile.profile_id;

  const experienceMutation = useMutation({
    mutationFn: () => {
      if (!targetProfileId) {
        throw new Error("This match is missing a profile id.");
      }
      return mindmatchApi.askExperience({
        target_profile_id: targetProfileId,
        question: experienceQuestion.trim(),
      });
    },
  });

  if (!matches || !match || !profile) {
    return (
      <section className="container flex min-h-[calc(100vh-4rem)] items-center justify-center px-5 py-20">
        <EmptyState
          icon={Search}
          title="Match not found"
          description="Please run matching first to view this detail report."
          action={
            <Button asChild>
              <Link href="/matches">
                <ArrowLeft className="size-4" />
                Back to matches
              </Link>
            </Button>
          }
          className="max-w-md"
        />
      </section>
    );
  }

  return (
    <section className="relative min-h-[calc(100vh-4rem)] overflow-hidden px-5 py-12 sm:px-8 md:py-16">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(circle_at_18%_8%,hsl(var(--primary)/0.13),transparent_28rem),radial-gradient(circle_at_86%_18%,hsl(var(--accent)/0.28),transparent_26rem)]" />

      <motion.div variants={softReveal} initial="initial" animate="animate" className="container max-w-4xl">
        <Button asChild variant="ghost" className="mb-8">
          <Link href="/matches">
            <ArrowLeft className="size-4" />
            Back to matches
          </Link>
        </Button>

        <div className="rounded-lg border bg-card/78 p-6 shadow-soft backdrop-blur-xl sm:p-10">
          <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
            <div className="flex items-center gap-4">
              <IdentityAvatar name={match.user} size="lg" />
              <div>
                <p className="text-sm font-medium uppercase tracking-[0.18em] text-muted-foreground">
                  Compatibility Report
                </p>
                <h1 className="mt-2 text-pretty text-2xl font-medium tracking-tight capitalize sm:text-3xl">{match.user}</h1>
              </div>
            </div>
            <ScoreRing score={match.score} />
          </div>

          <section className="mt-10 rounded-lg border bg-primary/5 p-6">
            <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">
              Executive Summary
            </h2>
            <p className="mt-3 text-[15px] leading-8 text-foreground">{match.reason}</p>
          </section>

          <section className="mt-10">
            <h2 className="mb-6 text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              Detailed Alignment Analysis
            </h2>
            <ProfileComparisonReport matchProfile={match.profile} myProfile={profile} />
          </section>

          <section className="mt-10 rounded-lg border bg-background/70 p-6">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-primary" />
              <h2 className="text-sm font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Ask From Their Experience
              </h2>
            </div>
            <p className="mt-3 text-sm leading-6 text-muted-foreground">
              MindMatch uses this matched user&apos;s stored profile, summaries, and recent LLM interaction context to synthesize advice. It does not send your question as a direct message.
            </p>
            <div className="mt-5 grid gap-3">
              <Textarea
                value={experienceQuestion}
                onChange={(event) => setExperienceQuestion(event.target.value)}
                placeholder={`Ask what ${match.user} might have useful experience with...`}
                className="min-h-24"
              />
              <Button
                type="button"
                disabled={!targetProfileId || !experienceQuestion.trim() || experienceMutation.isPending}
                onClick={() => experienceMutation.mutate()}
                className="w-fit"
              >
                {experienceMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                Ask with context
              </Button>
            </div>
            {experienceMutation.data ? (
              <div className="mt-5 rounded-lg border bg-primary/5 p-4">
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">
                  Synthesized from {experienceMutation.data.context_summary.memory_count} memories and {experienceMutation.data.context_summary.recent_exchange_count} recent exchanges
                </p>
                <p className="mt-3 whitespace-pre-wrap text-sm leading-7">{experienceMutation.data.answer}</p>
              </div>
            ) : null}
            {experienceMutation.error ? (
              <p className="mt-4 text-sm text-destructive">
                {experienceMutation.error instanceof Error ? experienceMutation.error.message : "Could not route this question."}
              </p>
            ) : null}
          </section>
        </div>
      </motion.div>
    </section>
  );
}
