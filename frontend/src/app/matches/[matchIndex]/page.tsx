import type { Metadata } from "next";

import { MatchDetailScreen } from "@/components/matches/match-detail-screen";

export const metadata: Metadata = {
  title: "Match Detail",
};

export default async function MatchDetailPage({
  params,
}: {
  params: Promise<{ matchIndex: string }>;
}) {
  const { matchIndex } = await params;

  return <MatchDetailScreen matchIndex={matchIndex} />;
}
