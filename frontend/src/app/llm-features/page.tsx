import type { Metadata } from "next";

import { LlmFeaturesScreen } from "@/components/llm-features/llm-features-screen";

export const metadata: Metadata = {
  title: "LLM Features",
  description: "Upcoming AI-powered features for MindMatch.",
};

export default function LlmFeaturesPage() {
  return <LlmFeaturesScreen />;
}
