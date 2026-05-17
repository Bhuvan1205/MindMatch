"use client";

import * as React from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Search } from "lucide-react";

import { EmptyState } from "@/components/feedback/empty-state";
import { ProfileComparisonReport } from "@/components/matches/profile-comparison-report";
import { ScoreRing } from "@/components/matches/score-ring";
import { IdentityAvatar } from "@/components/shared/identity-avatar";
import { Button } from "@/components/ui/button";
import { softReveal } from "@/components/motion/motion-config";
import { useProfileStore } from "@/stores/profile-store";

export function MatchDetailScreen({ matchIndex }: { matchIndex: string }) {
  const { matches, profile } = useProfileStore();
  const index = Number.parseInt(matchIndex, 10);
  const match = Number.isInteger(index) ? matches?.ranked_matches[index] : undefined;

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
            <p className="text-sm leading-7 text-muted-foreground">
              Want advice from {match.user} without starting a direct conversation? Ask Matcha in chat and it can relay the question for you.
            </p>
            <Button asChild className="mt-4 w-fit">
              <Link href="/chat">Open Matcha</Link>
            </Button>
          </section>
        </div>
      </motion.div>
    </section>
  );
}
